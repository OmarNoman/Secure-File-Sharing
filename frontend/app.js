const uploadForm = document.getElementById("upload-form");
const fileInput = document.getElementById("file-input");
const uploadButton = document.getElementById("upload-button");
const uploadStatus = document.getElementById("upload-status");
const fileList = document.getElementById("file-list");

let uploadedFiles = [];

function setStatus(message, kind) {
  uploadStatus.textContent = message;
  uploadStatus.className = "status" + (kind ? ` ${kind}` : "");
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

async function requestJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data && data.error && data.error.message
      ? data.error.message
      : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data;
}

async function loadFileList() {
  try {
    const response = await fetch("/api/files");
    if (!response.ok) throw new Error("Failed to load file list");
    uploadedFiles = await response.json();
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
    info.textContent = `${item.originalFileName} (${formatSize(item.sizeBytes)}, ${uploadedDate})`;

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
    setStatus(`Uploaded successfully as ${item.originalFileName}`, "success");
    uploadForm.reset();
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    uploadButton.disabled = false;
  }
});

loadFileList();
