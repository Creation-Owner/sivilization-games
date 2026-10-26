async function invokeFilmUploader(body) {
  const response = await fetch("/api/r2/multipart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, category: "films" }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error || "Cloudflare R2 film upload request failed.");
  }

  return data;
}

function uploadPart(url, blob, onProgress) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();

    request.open("PUT", url);
    request.timeout = 15 * 60 * 1000;

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(event.loaded);
      }
    };

    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve();
      } else {
        reject(new Error(`Cloudflare R2 returned HTTP ${request.status}.`));
      }
    };

    request.onerror = () => {
      reject(new Error("Upload network error."));
    };

    request.ontimeout = () => {
      reject(new Error("Upload timed out."));
    };

    request.onabort = () => {
      reject(new Error("Upload cancelled."));
    };

    request.send(blob);
  });
}

export async function uploadFilmToR2(file, onProgress) {
  const upload = await invokeFilmUploader({
    action: "start",
    file_name: file.name,
    size: file.size,
    content_type: file.type || "video/mp4",
  });

  if (
    !upload?.session ||
    !Number.isSafeInteger(upload.part_size) ||
    upload.part_size <= 0 ||
    !Number.isSafeInteger(upload.part_count)
  ) {
    throw new Error("The R2 upload service returned an invalid session.");
  }

  let completionRequested = false;

  try {
    for (let partNumber = 1; partNumber <= upload.part_count; partNumber += 1) {
      const start = (partNumber - 1) * upload.part_size;
      const blob = file.slice(
        start,
        Math.min(start + upload.part_size, file.size)
      );

      let uploaded = false;
      let lastError;

      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const { url } = await invokeFilmUploader({
            action: "part",
            session: upload.session,
            part_number: partNumber,
          });

          if (!url) {
            throw new Error("No part upload URL returned.");
          }

          await uploadPart(url, blob, (loaded) => {
            onProgress?.(
              Math.min(99, Math.floor(((start + loaded) / file.size) * 100))
            );
          });

          uploaded = true;
          break;
        } catch (error) {
          lastError = error;
          if (attempt < 2) {
            await new Promise((resolve) =>
              setTimeout(resolve, 1000 * (attempt + 1))
            );
          }
        }
      }

      if (!uploaded) {
        throw lastError || new Error("Could not upload video part to R2.");
      }
    }

    completionRequested = true;

    const result = await invokeFilmUploader({
      action: "complete",
      session: upload.session,
    });

    if (
      result?.video_storage_provider !== "r2" ||
      !result?.video_bucket ||
      !result?.video_path
    ) {
      throw new Error("Invalid completed film upload reference from R2.");
    }

    onProgress?.(100);
    return result;
  } catch (error) {
    if (!completionRequested) {
      await invokeFilmUploader({
        action: "abort",
        session: upload.session,
      }).catch(() => null);
    }
    throw error;
  }
}
