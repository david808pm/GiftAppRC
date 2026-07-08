export default function PrivacyConsent({ checked, onChange, error }) {
    return (
        <div className="privacy-consent">
            <label className="privacy-consent__checkbox">
                <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
                <span>
                    Acepto la Política de Privacidad y el tratamiento de mis datos para este proceso.
                </span>
            </label>
            <div className="privacy-consent__links">
                <a href="/privacy-policy.html" target="_blank" rel="noreferrer">
                    Ver términos y condiciones
                </a>
            </div>
            {error ? <p className="form-error">{error}</p> : null}
        </div>
    );
}
