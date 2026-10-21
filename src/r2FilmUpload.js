import { supabase } from "./supabaseClient";

async function callUploader(body) {
  const { data, error } = await supabase.functions.invoke(
    "r2-film-upload",
    { body },
  );

  if (error) {
    let message = error.message;

    if (typeof error.context?.json === "function") {
      const response = await error.context.json().catch(() => null);
      message = response?.error || message;
    }

    throw new Error(message || "R2 upload request failed.");
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  if (!data) {
    throw new Error("The upload service returned no data.");
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
        reject(new Error(`R2 returned HTTP ${request.status}.`));
      }
    };

    request.onerror = () => reject(new Error("Upload network error."));
    request.ontimeout = () => reject(new Error("Upload timed out."));
    request.onabort = () => reject(new Error("Upload cancelled."));

    request.send(blob);
  });
}

export async function uploadFilmToR2(file, onProgress) {
  const upload = await callUploader({
    action: "start",
    content_type: file.type,
    size: file.size,
  });

  let completionRequested = false;

  try {
    for (
      let partNumber = 1;
      partNumber <= upload.part_count;
      partNumber += 1
    ) {
      const start = (partNumber - 1) * upload.part_size;
      const end = Math.min(start + upload.part_size, file.size);
      const blob = file.slice(start, end);

      let uploaded = false;
      let lastError;

      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          // Get a fresh signed URL for each attempt.
          const { url } = await callUploader({
            action: "part",
            session: upload.session,
            part_number: partNumber,
          });

          await uploadPart(url, blob, (bytesLoaded) => {
            const percent = Math.min(
              99,
              Math.floor(((start + bytesLoaded) / file.size) * 100),
            );

            onProgress?.(percent);
          });

          uploaded = true;
          break;
        } catch (error) {
          lastError = error;

          if (attempt < 2) {
            await new Promise((resolve) =>
              setTimeout(resolve, 1000 * (attempt + 1)),
            );
          }
        }
      }

      if (!uploaded) {
        throw lastError || new Error("Could not upload video part.");
      }
    }

    completionRequested = true;

    const result = await callUploader({
      action: "complete",
      session: upload.session,
    });

    onProgress?.(100);
    return result;
  } catch (error) {
    if (!completionRequested) {
      await callUploader({
        action: "abort",
        session: upload.session,
      }).catch(() => {
        console.warn("Could not cancel the unfinished R2 upload.");
      });
    }

    throw error;
  }
}