"""Il pre-filtro della casella (2026-08-16): «posso dargli mittenti e
destinatari tra cui leggere, così ha solo le mail di quel cliente». Puro:
niente server IMAP, si prova coi messaggi costruiti.
"""

from __future__ import annotations

import email.message
import email.policy

from ugo_jobs.customer_mail import address_allowed


def _message(sender: str, to: str, cc: str | None = None) -> email.message.EmailMessage:
    message = email.message.EmailMessage(policy=email.policy.default)
    message["From"] = sender
    message["To"] = to
    if cc is not None:
        message["Cc"] = cc
    message.set_content("ciao")
    return message


def test_empty_filter_keeps_everything() -> None:
    message = _message("chiunque@ovunque.it", "casella@studio.it")
    assert address_allowed(message, None) is True
    assert address_allowed(message, "") is True
    assert address_allowed(message, "   ") is True


def test_exact_address_matches_from_to_and_cc() -> None:
    senders = "mario@rossi.it"
    assert address_allowed(_message("mario@rossi.it", "casella@studio.it"), senders)
    assert address_allowed(_message("casella@studio.it", "Mario <MARIO@ROSSI.IT>"), senders)
    assert address_allowed(
        _message("casella@studio.it", "altro@studio.it", cc="mario@rossi.it"), senders
    )
    assert not address_allowed(_message("estraneo@altrove.it", "casella@studio.it"), senders)


def test_domain_entry_matches_the_whole_company() -> None:
    senders = "@rossisrl.it, capo@altracosa.com"
    assert address_allowed(_message("chiunque@rossisrl.it", "casella@studio.it"), senders)
    assert address_allowed(_message("casella@studio.it", "ufficio@rossisrl.it"), senders)
    assert address_allowed(_message("capo@altracosa.com", "casella@studio.it"), senders)
    # il dominio è un suffisso col chiocciola davanti: «rossisrl.it.evil.com» non passa
    assert not address_allowed(_message("x@rossisrl.it.evil.com", "casella@studio.it"), senders)
    assert not address_allowed(_message("estraneo@altrove.it", "casella@studio.it"), senders)


def test_display_names_do_not_fool_the_filter() -> None:
    # il nome visualizzato può dire qualunque cosa: conta l'indirizzo
    message = _message('"mario@rossi.it" <truffa@phish.example>', "casella@studio.it")
    assert not address_allowed(message, "mario@rossi.it")
