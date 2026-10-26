const PUBLIC_R2_BASE = (import.meta.env.VITE_R2_PUBLIC_URL || "")
  .trim()
  .replace(/\/+$/, "");

export function getR2ObjectUrl(bucket = "games", path = "") {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("/api/r2/")) {
    return path;
  }
  if (PUBLIC_R2_BASE) {
    return `${PUBLIC_R2_BASE}/${encodeURI(path.replace(/^\/+/, ""))}`;
  }
  const encodedPath = path
    .replace(/^\/+/, "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `/api/r2/object/${encodeURIComponent(bucket || "games")}/${encodedPath}`;
}

export function uploadAssetToR2(
  file,
  { folder = "assets", bucket = "assets", onProgress } = {}
) {
  return new Promise((resolve, reject) => {
    const query = new URLSearchParams({
      folder,
      bucket,
      file_name: file.name || "upload",
      content_type: file.type || "application/octet-stream",
    });

    const request = new XMLHttpRequest();
    request.open("PUT", `/api/r2/upload-object?${query.toString()}`);
    request.setRequestHeader(
      "Content-Type",
      file.type || "application/octet-stream"
    );
    request.timeout = 10 * 60 * 1000;

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress?.(percent);
      }
    };

    request.onload = () => {
      let payload = null;
      try {
        payload = JSON.parse(request.responseText);
      } catch {
        payload = null;
      }

      if (request.status >= 200 && request.status < 300 && payload?.path) {
        resolve({
          storage_provider: "r2",
          bucket: payload.bucket || bucket,
          path: payload.path,
          publicUrl:
            payload.publicUrl || getR2ObjectUrl(payload.bucket || bucket, payload.path),
        });
      } else {
        reject(
          new Error(
            payload?.error ||
              `Cloudflare R2 upload failed (HTTP ${request.status}).`
          )
        );
      }
    };

    request.onerror = () => {
      reject(new Error("Network error while uploading to Cloudflare R2."));
    };

    request.ontimeout = () => {
      reject(new Error("Cloudflare R2 upload timed out."));
    };

    request.send(file);
  });
}

export async function getR2DownloadUrl({ bucket = "games", path }) {
  if (!path) {
    throw new Error("Missing R2 object path for download.");
  }

  const response = await fetch("/api/r2/download-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bucket, path }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.url) {
    throw new Error(
      data?.error || "Could not prepare Cloudflare R2 download URL."
    );
  }

  return data;
}

export async function deleteFromR2({ bucket = "games", paths = [] }) {
  const validPaths = (Array.isArray(paths) ? paths : [paths]).filter(Boolean);
  if (validPaths.length === 0) return { ok: true };

  const response = await fetch("/api/r2/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bucket, paths: validPaths }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      data?.error || "Could not delete files from Cloudflare R2."
    );
  }

  return data;
}
