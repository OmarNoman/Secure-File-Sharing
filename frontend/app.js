const TOKEN_KEY = "sfs_token";
const USERNAME_KEY = "sfs_username";

const authSection = document.getElementById("auth-section");
const appSection = document.getElementById("app-section");
const authStatus = document.getElementById("auth-status");
const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");
const tabButtons = document.querySelectorAll(".tab-button");
const currentUsernameEl = document.getElementById("current-username");
const logoutButton = document.getElementById("logout-button");

const uploadForm = document.getElementById("upload-form");
const fileInput = document.getElementById("file-input");
const uploadButton = document.getElementById("upload-button");
const uploadStatus = document.getElementById("upload-status");
const fileList = document.getElementById("file-list");

let uploadedFiles = [];

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setSession(token, username) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

function setAuthStatus(message, kind) {
  authStatus.textContent = message || "";
  authStatus.className = "status" + (kind ? ` ${kind}` : "");
}

function setStatus(message, kind) {
  uploadStatus.textContent = message;
  uploadStatus.className = "status" + (kind ? ` ${kind}` : "");
}

function showApp() {
  authSection.classList.add("hidden");
  appSection.classList.remove("hidden");
  currentUsernameEl.textContent = localStorage.getItem(USERNAME_KEY) || "";
  loadFileList();
}

function showAuth(message) {
  appSection.classList.add("hidden");
  authSection.classList.remove("hidden");
  setAuthStatus(message, message ? "error" : undefined);
}

function formatSize(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;
  return `${exponent === 0 ? value : value.toFixed(1)} ${units[exponent]}`;
}

function scanStatusLabel(status) {
  if (status === "clean") return "clean";
  if (status === "infected") return "infected, download blocked";
  return "pending scan";
}

async function requestJson(url, body, { auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (auth && response.status === 401) {
    clearSession();
    showAuth("Session expired. Please log in again.");
    throw new Error("Session expired");
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data && data.error && data.error.message
      ? data.error.message
      : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data;
}

async function authedGet(url) {
  const token = getToken();
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (response.status === 401) {
    clearSession();
    showAuth("Session expired. Please log in again.");
    throw new Error("Session expired");
  }

  if (!response.ok) throw new Error("Failed to load file list");
  return response.json();
}

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    tabButtons.forEach((b) => b.classList.remove("active"));
    button.classList.add("active");
    const isLogin = button.dataset.tab === "login";
    loginForm.classList.toggle("hidden", !isLogin);
    signupForm.classList.toggle("hidden", isLogin);
    setAuthStatus();
  });
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = document.getElementById("login-username").value;
  const password = document.getElementById("login-password").value;

  setAuthStatus("Logging in...");
  try {
    const result = await requestJson(
      "/api/auth/login",
      { username, password },
      { auth: false },
    );
    setSession(result.token, result.username);
    setAuthStatus();
    showApp();
  } catch (error) {
    setAuthStatus(error.message, "error");
  }
});

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = document.getElementById("signup-username").value;
  const password = document.getElementById("signup-password").value;

  setAuthStatus("Creating account...");
  try {
    const result = await requestJson(
      "/api/auth/signup",
      { username, password },
      { auth: false },
    );
    setSession(result.token, result.username);
    setAuthStatus();
    showApp();
  } catch (error) {
    setAuthStatus(error.message, "error");
  }
});

logoutButton.addEventListener("click", () => {
  clearSession();
  uploadedFiles = [];
  showAuth();
});

async function loadFileList() {
  try {
    uploadedFiles = await authedGet("/api/files");
  } catch {
    uploadedFiles = [];
  }
  renderFileList();
}

async function uploadFileWithPresignedUrl(file) {
  const { key, uploadUrl, requiredHeaders } = await requestJson(
    "/api/files/upload-url",
    { fileName: file.name, contentType: file.type || "application/octet-stream" },
  );

  const putResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: requiredHeaders,
    body: file,
  });

  if (!putResponse.ok) {
    throw new Error(`S3 upload failed with status ${putResponse.status}`);
  }

  return requestJson("/api/files/confirm", { key });
}

function renderFileList() {
  if (uploadedFiles.length === 0) {
    fileList.innerHTML = '<li class="empty">No files uploaded yet.</li>';
    return;
  }

  fileList.innerHTML = "";

  for (const item of uploadedFiles) {
    const li = document.createElement("li");

    const info = document.createElement("span");
    info.className = "key";
    const uploadedDate = new Date(item.uploadedAt).toLocaleString();
    info.textContent = `${item.originalFileName} (${formatSize(item.sizeBytes)}, ${uploadedDate}, ${scanStatusLabel(item.scanStatus)})`;

    const actions = document.createElement("span");
    actions.className = "actions";

    const linkStatus = document.createElement("span");
    linkStatus.className = "hint";

    const downloadButton = document.createElement("button");
    downloadButton.type = "button";
    downloadButton.className = "secondary";
    downloadButton.textContent = "Get download link";
    downloadButton.addEventListener("click", async () => {
      downloadButton.disabled = true;
      linkStatus.textContent = "Generating...";

      try {
        const { downloadUrl, expiresInSeconds } = await requestJson(
          "/api/files/download-url",
          { key: item.fileKey },
        );

        linkStatus.textContent = "";
        actions.removeChild(downloadButton);

        const link = document.createElement("a");
        link.href = downloadUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = `Download (expires in ${expiresInSeconds}s)`;
        actions.appendChild(link);
      } catch (error) {
        linkStatus.textContent = error.message;
        downloadButton.disabled = false;
      }
    });

    actions.appendChild(downloadButton);
    actions.appendChild(linkStatus);

    li.appendChild(info);
    li.appendChild(actions);
    fileList.appendChild(li);
  }
}

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const file = fileInput.files[0];

  if (!file) {
    setStatus("Choose a file first.", "error");
    return;
  }

  uploadButton.disabled = true;
  setStatus(`Uploading ${file.name}...`);

  try {
    const item = await uploadFileWithPresignedUrl(file);
    uploadedFiles.unshift(item);
    renderFileList();
    setStatus(`Uploaded ${item.originalFileName}. It stays pending until scanned.`, "success");
    uploadForm.reset();
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    uploadButton.disabled = false;
  }
});

if (getToken()) {
  showApp();
} else {
  showAuth();
}
