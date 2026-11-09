//! I pezzi trascritti di una dettatura lunga, ricuciti in un testo solo.

/// Uno spazio fra un pezzo e l'altro, niente pezzi vuoti, niente spazi doppi.
pub fn join_parts(parts: &[String]) -> String {
    parts
        .iter()
        .map(|part| part.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parts_are_joined_with_single_spaces() {
        let parts = vec![
            " Ciao,  come stai? ".to_string(),
            String::new(),
            "Bene.\n".to_string(),
        ];
        assert_eq!(join_parts(&parts), "Ciao, come stai? Bene.");
        assert_eq!(join_parts(&[]), "");
    }
}
