//! L'audio nella forma che soul si aspetta (`apps/soul/src/routes/stt.ts`):
//! mono, 16 kHz, PCM int16 little-endian. Tutto puro, quindi testato qui.

/// La frequenza della dettatura di casa: quella con cui whisper è stato addestrato.
pub const TARGET_RATE: u32 = 16_000;
const RATE: usize = TARGET_RATE as usize;

/// Soul rifiuta un clip oltre ~12 s (520 000 caratteri di base64). Undici lasciano
/// margine all'arrotondamento del base64 e all'intestazione JSON.
pub const MAX_CLIP_SAMPLES: usize = 11 * RATE;

/// Sotto 0,8 s la percezione risponde 422 («non trascrivibile»): un clip così
/// non si manda, e un taglio non deve mai lasciare una coda così corta.
pub const MIN_CLIP_SAMPLES: usize = RATE * 8 / 10;

/// Dove cercare il silenzio per tagliare: gli ultimi due secondi prima del tetto.
const SEARCH_SAMPLES: usize = 2 * RATE;
/// La finestra con cui si misura «quanto è silenzioso qui»: 100 ms.
const FRAME_SAMPLES: usize = RATE / 10;

/// Da campioni interlacciati a un solo canale, per media.
pub fn downmix(interleaved: &[f32], channels: u16) -> Vec<f32> {
    let channels = usize::from(channels.max(1));
    if channels == 1 {
        return interleaved.to_vec();
    }
    interleaved
        .chunks_exact(channels)
        .map(|frame| frame.iter().sum::<f32>() / channels as f32)
        .collect()
}

/// Ricampionamento lineare verso 16 kHz. Per la voce basta: whisper non sente la
/// differenza da un filtro polifase, e qui non serve una dipendenza in più.
pub fn resample(input: &[f32], from_rate: u32) -> Vec<f32> {
    if from_rate == TARGET_RATE || input.is_empty() {
        return input.to_vec();
    }
    let ratio = f64::from(from_rate) / f64::from(TARGET_RATE);
    let out_len = ((input.len() as f64) / ratio).floor() as usize;
    (0..out_len)
        .map(|i| {
            let position = i as f64 * ratio;
            let left = position.floor() as usize;
            let right = (left + 1).min(input.len() - 1);
            let weight = (position - left as f64) as f32;
            input[left] * (1.0 - weight) + input[right] * weight
        })
        .collect()
}

/// Da float in [-1, 1] a int16, saturando invece di avvolgere: un picco che
/// sfora diventa un picco, non un clic dall'altra parte della scala.
pub fn to_pcm16(samples: &[f32]) -> Vec<i16> {
    samples
        .iter()
        .map(|sample| (sample.clamp(-1.0, 1.0) * f32::from(i16::MAX)).round() as i16)
        .collect()
}

pub fn pcm16_le_bytes(samples: &[i16]) -> Vec<u8> {
    samples
        .iter()
        .flat_map(|sample| sample.to_le_bytes())
        .collect()
}

fn frame_energy(frame: &[i16]) -> u64 {
    frame
        .iter()
        .map(|sample| u64::from(sample.unsigned_abs()).pow(2))
        .sum()
}

/// Taglia una dettatura lunga in clip che soul accetta, **nei silenzi**: un taglio
/// in mezzo a una parola la fa trascrivere a metà in due clip diversi.
/// Una dettatura più corta del minimo non produce clip: non c'è niente da mandare.
pub fn split_clips(samples: &[i16]) -> Vec<&[i16]> {
    let mut clips = Vec::new();
    let mut rest = samples;
    while rest.len() > MAX_CLIP_SAMPLES {
        // il taglio non deve lasciare dietro di sé una coda troppo corta da mandare
        let latest = MAX_CLIP_SAMPLES.min(rest.len() - MIN_CLIP_SAMPLES);
        let earliest = latest.saturating_sub(SEARCH_SAMPLES).max(MIN_CLIP_SAMPLES);
        let mut cut = latest;
        let mut quietest = u64::MAX;
        let mut start = earliest;
        while start + FRAME_SAMPLES <= latest {
            let energy = frame_energy(&rest[start..start + FRAME_SAMPLES]);
            if energy < quietest {
                quietest = energy;
                cut = start + FRAME_SAMPLES / 2;
            }
            start += FRAME_SAMPLES / 2;
        }
        let (clip, tail) = rest.split_at(cut);
        clips.push(clip);
        rest = tail;
    }
    if rest.len() >= MIN_CLIP_SAMPLES {
        clips.push(rest);
    }
    clips
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn downmix_averages_the_channels() {
        assert_eq!(downmix(&[1.0, 0.0, 0.5, 0.5], 2), vec![0.5, 0.5]);
        assert_eq!(downmix(&[0.25, -0.25], 1), vec![0.25, -0.25]);
    }

    #[test]
    fn resample_from_48k_keeps_the_duration() {
        let one_second = vec![0.0_f32; 48_000];
        assert_eq!(resample(&one_second, 48_000).len(), 16_000);
        let same = vec![0.1_f32; 160];
        assert_eq!(resample(&same, 16_000), same);
    }

    #[test]
    fn resample_interpolates_between_neighbours() {
        // 32 kHz → 16 kHz: un campione ogni due, quindi i pari
        assert_eq!(resample(&[0.0, 1.0, 0.0, 1.0], 32_000), vec![0.0, 0.0]);
        // 24 kHz → 16 kHz: il secondo campione cade a metà fra 1 e 2
        let out = resample(&[0.0, 1.0, 2.0, 3.0, 4.0, 5.0], 24_000);
        assert_eq!(out.len(), 4);
        assert!((out[1] - 1.5).abs() < 1e-6);
    }

    #[test]
    fn pcm16_saturates_instead_of_wrapping() {
        assert_eq!(
            to_pcm16(&[0.0, 1.0, -1.0, 2.0, -3.0]),
            vec![0, 32767, -32767, 32767, -32767]
        );
        assert_eq!(pcm16_le_bytes(&[1, -2]), vec![1, 0, 0xfe, 0xff]);
    }

    #[test]
    fn a_short_dictation_is_one_clip_and_a_blip_is_none() {
        let three_seconds = vec![100_i16; 3 * RATE];
        assert_eq!(split_clips(&three_seconds).len(), 1);
        let blip = vec![100_i16; MIN_CLIP_SAMPLES - 1];
        assert!(split_clips(&blip).is_empty());
    }

    #[test]
    fn a_long_dictation_is_cut_in_the_silence_under_the_cap() {
        // 20 s di voce con una pausa di 300 ms attorno al secondo 10
        let mut samples = vec![8_000_i16; 20 * RATE];
        for sample in &mut samples[10 * RATE..10 * RATE + 3 * RATE / 10] {
            *sample = 0;
        }
        let clips = split_clips(&samples);
        assert_eq!(clips.len(), 2);
        assert!(clips.iter().all(|clip| clip.len() <= MAX_CLIP_SAMPLES));
        assert!(clips.iter().all(|clip| clip.len() >= MIN_CLIP_SAMPLES));
        // il taglio cade dentro la pausa
        let cut = clips[0].len();
        assert!(
            (10 * RATE..10 * RATE + 3 * RATE / 10).contains(&cut),
            "cut at {cut}"
        );
        assert_eq!(
            clips.iter().map(|clip| clip.len()).sum::<usize>(),
            samples.len()
        );
    }

    #[test]
    fn a_cut_never_leaves_a_tail_too_short_to_send() {
        let samples = vec![8_000_i16; MAX_CLIP_SAMPLES + MIN_CLIP_SAMPLES / 2];
        let clips = split_clips(&samples);
        assert_eq!(clips.len(), 2);
        assert!(clips[1].len() >= MIN_CLIP_SAMPLES);
        assert_eq!(clips[0].len() + clips[1].len(), samples.len());
    }
}
