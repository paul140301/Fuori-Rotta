// Login con email + password: niente redirect via email, quindi niente
// "connection refused" dovuti a URL di conferma non raggiungibili. Stesso
// account su PC/iPad/iPhone.
//
// Nota: se sul progetto Supabase è attiva la conferma email (Authentication
// → Providers → Email → "Confirm email"), la registrazione manderà comunque
// un'email con un link da cliccare prima di poter accedere — che può avere
// lo stesso problema del magic link se il redirect URL non è raggiungibile.
// Per un'app personale conviene disattivare quel toggle: la registrazione
// crea allora una sessione valida subito, senza email di mezzo.

let authMode = "signin"; // oppure "signup"

function showAuthOverlay() {
  document.getElementById("authGate").classList.remove("hidden");
}
function hideAuthOverlay() {
  document.getElementById("authGate").classList.add("hidden");
}

function applyAuthMode() {
  document.getElementById("authTitle").textContent = authMode === "signin" ? "Accedi" : "Crea account";
  document.getElementById("authSubmit").textContent = authMode === "signin" ? "Accedi" : "Crea account";
  document.getElementById("authToggleMode").textContent =
    authMode === "signin" ? "Non hai un account? Registrati" : "Hai già un account? Accedi";
  document.getElementById("authPassword").autocomplete = authMode === "signin" ? "current-password" : "new-password";
}

function initAuthForm() {
  const form = document.getElementById("authForm");
  const status = document.getElementById("authStatus");
  const btn = document.getElementById("authSubmit");
  const toggle = document.getElementById("authToggleMode");

  applyAuthMode();

  toggle.addEventListener("click", () => {
    authMode = authMode === "signin" ? "signup" : "signin";
    status.textContent = "";
    status.classList.remove("error");
    applyAuthMode();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("authEmail").value.trim();
    const password = document.getElementById("authPassword").value;
    if (!email || password.length < 6) return;

    btn.disabled = true;
    status.classList.remove("error");
    status.textContent = authMode === "signin" ? "Accesso in corso…" : "Creazione account in corso…";

    const { data, error } =
      authMode === "signin"
        ? await sb.auth.signInWithPassword({ email, password })
        : await sb.auth.signUp({ email, password });

    btn.disabled = false;

    if (error) {
      status.textContent = `Errore: ${error.message}`;
      status.classList.add("error");
      return;
    }

    // Se la conferma email è attiva su Supabase, signUp riesce ma non c'è
    // ancora una sessione: lo segnaliamo invece di far credere che sia fatto.
    if (authMode === "signup" && !data.session) {
      status.textContent = "Account creato: controlla la posta per confermare l'indirizzo prima di accedere.";
      return;
    }

    // In caso di successo con sessione, onAuthStateChange (in ensureSession)
    // si occupa di nascondere l'overlay.
  });
}

function ensureSession() {
  return new Promise((resolve) => {
    sb.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        hideAuthOverlay();
        resolve(session);
        return;
      }
      showAuthOverlay();
      const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
        if (session) {
          hideAuthOverlay();
          sub.subscription.unsubscribe();
          resolve(session);
        }
      });
    });
  });
}

async function currentUserEmail() {
  const { data } = await sb.auth.getUser();
  return data?.user?.email || null;
}

async function signOutAndReload() {
  await sb.auth.signOut();
  window.location.reload();
}
