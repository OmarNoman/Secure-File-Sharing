const uploadForm = document.getElementById("upload-form");
const fileInput = document.getElementById("file-input");
const uploadButton = document.getElementById("upload-button");
const uploadStatus = document.getElementById("upload-status");
const fileList = document.getElementById("file-list");

const uploadedKeys = [];

function setStatus(message, kind) {
  uploadStatus.textContent = message;
  uploadStatus.className = "status" + (kind ? ` ${kind}` : "");
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

  return key;
}

function renderFileList() {
  if (uploadedKeys.length === 0) {
    fileList.innerHTML = '<li class="empty">No files uploaded yet.</li>';
    return;
  }

  fileList.innerHTML = "";

  for (const key of uploadedKeys) {
    const item = document.createElement("li");

    const keySpan = document.createElement("span");
    keySpan.className = "key";
    keySpan.textContent = key;

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
          { key },
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

    item.appendChild(keySpan);
    item.appendChild(actions);
    fileList.appendChild(item);
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
    const key = await uploadFileWithPresignedUrl(file);
    uploadedKeys.unshift(key);
    renderFileList();
    setStatus(`Uploaded successfully as ${key}`, "success");
    uploadForm.reset();
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    uploadButton.disabled = false;
  }
});

renderFileList();
