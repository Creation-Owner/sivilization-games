import { supabase } from "./supabaseClient";

async function invokeUploader(body) {
  const { data, error } = await supabase.functions.invoke(
    "r2-game-upload",
    { body },
  );

  if (error) {
    let message = error.message;

    if (typeof error.context?.json === "function") {
      const detail = await error.context.json().catch(() => null);
      message = detail?.error || message;
    }

    throw new Error(message || "Game upload request failed.");
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

export async function uploadGameToR2(file, onProgress) {
  const upload = await invokeUploader({
    action: "start",
    file_name: file.name,
    size: file.size,
  });

  if (
    !upload.session ||
    !Number.isSafeInteger(upload.part_size) ||
    upload.part_size <= 0 ||
    !Number.isSafeInteger(upload.part_count) ||
    upload.part_count !== Math.ceil(file.size / upload.part_size)
  ) {
    throw new Error("The upload service returned an invalid session.");
  }

  let completionRequested = false;

  try {
    for (
      let partNumber = 1;
      partNumber <= upload.part_count;
      partNumber += 1
    ) {
      const start = (partNumber - 1) * upload.part_size;

      const blob = file.slice(
        start,
        Math.min(start + upload.part_size, file.size),
      );

      let uploaded = false;
      let lastError;

      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const { url } = await invokeUploader({
            action: "part",
            session: upload.session,
            part_number: partNumber,
          });

          if (!url) {
            throw new Error("No part upload URL returned.");
          }

          await uploadPart(url, blob, (loaded) => {
            onProgress?.(
              Math.min(
                99,
                Math.floor(((start + loaded) / file.size) * 100),
              ),
            );
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
        throw lastError || new Error("Could not upload part.");
      }
    }

    completionRequested = true;

    let result;
    let lastError;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        result = await invokeUploader({
          action: "complete",
          session: upload.session,
        });

        break;
      } catch (error) {
        lastError = error;

        if (attempt === 0) {
          await new Promise((resolve) =>
            setTimeout(resolve, 1500),
          );
        }
      }
    }

    if (!result) {
      throw lastError || new Error("Could not complete upload.");
    }

    if (
      result.game_storage_provider !== "r2" ||
      !result.game_bucket ||
      !result.game_path ||
      !result.upload_receipt
    ) {
      throw new Error("Invalid completed-upload reference.");
    }

    onProgress?.(100);

    return result;
  } catch (error) {
    if (!completionRequested) {
      await invokeUploader({
        action: "abort",
        session: upload.session,
      }).catch(() => {
        console.warn(
          "Could not abort unfinished upload. Check the R2 lifecycle policy.",
        );
      });
    }

    throw new Error(
      completionRequested
        ? `${error.message} The package may already exist in R2. Check the bucket before uploading again.`
        : error.message,
    );
  }
}