//! Il microfono. `cpal::Stream` non si può spostare fra thread su macOS, quindi
//! vive in un thread suo e gli si parla per messaggi.

use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::SampleFormat;

use crate::audio::{downmix, resample, to_pcm16};

/// Tre minuti al massimo: oltre, non è una dettatura, è un nastro lasciato acceso.
const MAX_SECONDS: usize = 180;

enum Command {
    Start(mpsc::Sender<Result<(), String>>),
    Stop(mpsc::Sender<Vec<i16>>),
}

pub struct Recorder {
    commands: mpsc::Sender<Command>,
}

struct Live {
    _stream: cpal::Stream,
    samples: Arc<Mutex<Vec<f32>>>,
    rate: u32,
    channels: u16,
}

fn open_microphone() -> Result<Live, String> {
    let device = cpal::default_host()
        .default_input_device()
        .ok_or("nessun microfono disponibile")?;
    let supported = device.default_input_config().map_err(|e| e.to_string())?;
    let format = supported.sample_format();
    let config: cpal::StreamConfig = supported.into();
    let rate = config.sample_rate.0;
    let channels = config.channels;
    let cap = MAX_SECONDS * rate as usize * usize::from(channels);
    let samples = Arc::new(Mutex::new(Vec::<f32>::new()));
    let sink = Arc::clone(&samples);
    let push = move |data: &mut dyn Iterator<Item = f32>| {
        if let Ok(mut buffer) = sink.lock() {
            let room = cap.saturating_sub(buffer.len());
            buffer.extend(data.take(room));
        }
    };
    let on_error = |error: cpal::StreamError| eprintln!("microfono: {error}");
    let stream = match format {
        SampleFormat::F32 => device.build_input_stream(
            &config,
            move |data: &[f32], _: &_| push(&mut data.iter().copied()),
            on_error,
            None,
        ),
        SampleFormat::I16 => device.build_input_stream(
            &config,
            move |data: &[i16], _: &_| push(&mut data.iter().map(|s| f32::from(*s) / 32_768.0)),
            on_error,
            None,
        ),
        SampleFormat::U16 => device.build_input_stream(
            &config,
            move |data: &[u16], _: &_| {
                push(&mut data.iter().map(|s| (f32::from(*s) - 32_768.0) / 32_768.0))
            },
            on_error,
            None,
        ),
        other => return Err(format!("formato del microfono non gestito: {other}")),
    }
    .map_err(|e| e.to_string())?;
    stream.play().map_err(|e| e.to_string())?;
    Ok(Live {
        _stream: stream,
        samples,
        rate,
        channels,
    })
}

impl Recorder {
    pub fn spawn() -> Self {
        let (commands, inbox) = mpsc::channel::<Command>();
        thread::spawn(move || {
            let mut live: Option<Live> = None;
            for command in inbox {
                match command {
                    Command::Start(reply) => {
                        let result = if live.is_some() {
                            Ok(())
                        } else {
                            open_microphone().map(|opened| live = Some(opened))
                        };
                        let _ = reply.send(result);
                    }
                    Command::Stop(reply) => {
                        let pcm = live.take().map_or_else(Vec::new, |finished| {
                            let raw = finished
                                .samples
                                .lock()
                                .map(|b| b.clone())
                                .unwrap_or_default();
                            to_pcm16(&resample(&downmix(&raw, finished.channels), finished.rate))
                        });
                        let _ = reply.send(pcm);
                    }
                }
            }
        });
        Self { commands }
    }

    pub fn start(&self) -> Result<(), String> {
        let (reply, answer) = mpsc::channel();
        self.commands
            .send(Command::Start(reply))
            .map_err(|e| e.to_string())?;
        answer.recv().map_err(|e| e.to_string())?
    }

    /// L'audio registrato, già nella forma di soul (mono, 16 kHz, PCM16).
    pub fn stop(&self) -> Vec<i16> {
        let (reply, answer) = mpsc::channel();
        if self.commands.send(Command::Stop(reply)).is_err() {
            return Vec::new();
        }
        answer.recv().unwrap_or_default()
    }
}
