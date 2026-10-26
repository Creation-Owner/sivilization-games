import express from "express";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const PART_SIZE = 10 * 1024 * 1024; // 10 MiB chunks

function getR2Config() {
  const accountId = process.env.R2_ACCOUNT_ID?.trim() || "";
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim() || "";
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim() || "";
  const endpoint =
    process.env.R2_ENDPOINT?.trim() ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");
  const defaultBucket =
    process.env.R2_BUCKET_NAME?.trim() ||
    process.env.R2_GAMES_BUCKET?.trim() ||
    "sivilization-r2";
  const gamesBucket = process.env.R2_GAMES_BUCKET?.trim() || defaultBucket;
  const filmsBucket = process.env.R2_FILMS_BUCKET?.trim() || defaultBucket;
  const assetsBucket = process.env.R2_ASSETS_BUCKET?.trim() || defaultBucket;
  const publicUrl =
    process.env.R2_PUBLIC_URL?.trim() ||
    process.env.VITE_R2_PUBLIC_URL?.trim() ||
    "";

  const configured = Boolean(endpoint && accessKeyId && secretAccessKey);

  return {
    configured,
    accountId,
    endpoint,
    accessKeyId,
    secretAccessKey,
    defaultBucket,
    gamesBucket,
    filmsBucket,
    assetsBucket,
    publicUrl: publicUrl.replace(/\/+$/, ""),
  };
}

function createR2Client() {
  const cfg = getR2Config();
  if (!cfg.configured) return null;

  return new S3Client({
    region: "auto",
    endpoint: cfg.endpoint,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
}

function safeFileName(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(-140) || "file"
  );
}

interface MultipartSession {
  id: string;
  uploadId: string;
  bucket: string;
  key: string;
  size: number;
  partSize: number;
  partCount: number;
  contentType: string;
  parts: Map<number, { ETag: string; data?: Buffer }>;
  createdAt: number;
}

const multipartSessions = new Map<string, MultipartSession>();
const localObjects = new Map<
  string,
  { data: Buffer; contentType: string; updatedAt: number }
>();

function makeReceipt(bucket: string, key: string, size: number): string {
  const secret =
    process.env.R2_SECRET_ACCESS_KEY || "sivilization-r2-receipt-secret";
  const payload = JSON.stringify({
    bucket,
    key,
    size,
    issued_at: new Date().toISOString(),
  });
  const sig = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  return Buffer.from(JSON.stringify({ payload, sig })).toString("base64url");
}

function buildPublicObjectUrl(bucket: string, key: string): string {
  const cfg = getR2Config();
  if (cfg.publicUrl) {
    return `${cfg.publicUrl}/${encodeURI(key)}`;
  }
  return `/api/r2/object/${encodeURIComponent(bucket)}/${key
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

async function startServer() {
  const app = express();

  app.use("/api/r2/upload-part", express.raw({ type: "*/*", limit: "100mb" }));
  app.use(
    "/api/r2/upload-object",
    express.raw({ type: "*/*", limit: "50mb" })
  );
  app.use(express.json({ limit: "10mb" }));

  // 1. Check Cloudflare R2 status
  app.get("/api/r2/status", (_req, res) => {
    const cfg = getR2Config();
    res.json({
      provider: "cloudflare-r2",
      configured: cfg.configured,
      buckets: {
        default: cfg.defaultBucket,
        games: cfg.gamesBucket,
        films: cfg.filmsBucket,
        assets: cfg.assetsBucket,
      },
      hasPublicDomain: Boolean(cfg.publicUrl),
    });
  });

  // 2. Multipart upload lifecycle (start / part / complete / abort) for games & films
  app.post("/api/r2/multipart", async (req, res) => {
    try {
      const cfg = getR2Config();
      const s3 = createR2Client();
      const {
        action,
        file_name,
        size,
        content_type,
        category = "games",
        session: sessionId,
        part_number,
      } = req.body || {};

      if (action === "start") {
        const fileSize = Number(size);
        if (!file_name || !Number.isSafeInteger(fileSize) || fileSize < 1) {
          res.status(400).json({ error: "Invalid file_name or size." });
          return;
        }

        const bucket =
          category === "films" ? cfg.filmsBucket : cfg.gamesBucket;
        const folder = category === "films" ? "videos" : "packages";
        const key = `${folder}/${crypto.randomUUID()}-${safeFileName(
          String(file_name)
        )}`;
        const contentType =
          typeof content_type === "string" && content_type
            ? content_type
            : "application/octet-stream";

        const partSize = PART_SIZE;
        const partCount = Math.max(1, Math.ceil(fileSize / partSize));
        let uploadId = `local-${crypto.randomUUID()}`;

        if (s3) {
          const created = await s3.send(
            new CreateMultipartUploadCommand({
              Bucket: bucket,
              Key: key,
              ContentType: contentType,
            })
          );
          if (!created.UploadId) {
            throw new Error("Cloudflare R2 did not return an UploadId.");
          }
          uploadId = created.UploadId;
        }

        const id = crypto.randomUUID();
        multipartSessions.set(id, {
          id,
          uploadId,
          bucket,
          key,
          size: fileSize,
          partSize,
          partCount,
          contentType,
          parts: new Map(),
          createdAt: Date.now(),
        });

        res.json({
          session: id,
          bucket,
          key,
          part_size: partSize,
          part_count: partCount,
        });
        return;
      }

      if (action === "part") {
        const current = multipartSessions.get(String(sessionId));
        const partNum = Number(part_number);
        if (
          !current ||
          !Number.isSafeInteger(partNum) ||
          partNum < 1 ||
          partNum > current.partCount
        ) {
          res.status(400).json({ error: "Invalid upload session or part." });
          return;
        }

        const url = `/api/r2/upload-part?session=${encodeURIComponent(
          current.id
        )}&part_number=${partNum}`;

        res.json({ url });
        return;
      }

      if (action === "complete") {
        const current = multipartSessions.get(String(sessionId));
        if (!current) {
          res.status(400).json({ error: "Upload session not found." });
          return;
        }

        if (current.parts.size !== current.partCount) {
          res.status(400).json({
            error: `Expected ${current.partCount} uploaded parts, found ${current.parts.size}.`,
          });
          return;
        }

        const sortedParts = Array.from(current.parts.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([PartNumber, part]) => ({
            PartNumber,
            ETag: part.ETag,
          }));

        if (s3) {
          await s3.send(
            new CompleteMultipartUploadCommand({
              Bucket: current.bucket,
              Key: current.key,
              UploadId: current.uploadId,
              MultipartUpload: { Parts: sortedParts },
            })
          );
        } else {
          const buffers = Array.from(current.parts.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([, part]) => part.data || Buffer.alloc(0));
          localObjects.set(`${current.bucket}/${current.key}`, {
            data: Buffer.concat(buffers),
            contentType: current.contentType,
            updatedAt: Date.now(),
          });
        }

        multipartSessions.delete(current.id);
        const receipt = makeReceipt(current.bucket, current.key, current.size);
        const publicUrl = buildPublicObjectUrl(current.bucket, current.key);

        res.json({
          storage_provider: "r2",
          bucket: current.bucket,
          path: current.key,
          public_url: publicUrl,
          game_storage_provider: "r2",
          game_bucket: current.bucket,
          game_path: current.key,
          video_storage_provider: "r2",
          video_bucket: current.bucket,
          video_path: current.key,
          upload_receipt: receipt,
        });
        return;
      }

      if (action === "abort") {
        const current = multipartSessions.get(String(sessionId));
        if (current) {
          if (s3) {
            await s3
              .send(
                new AbortMultipartUploadCommand({
                  Bucket: current.bucket,
                  Key: current.key,
                  UploadId: current.uploadId,
                })
              )
              .catch(() => null);
          }
          multipartSessions.delete(current.id);
        }
        res.json({ aborted: true });
        return;
      }

      res.status(400).json({ error: "Unsupported multipart action." });
    } catch (error) {
      console.error("R2 multipart error:", error);
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : "Cloudflare R2 multipart operation failed.",
      });
    }
  });

  // 3. Receive PUT chunk for multipart upload and forward to Cloudflare R2
  app.put("/api/r2/upload-part", async (req, res) => {
    try {
      const sessionId = String(req.query.session || "");
      const partNumber = Number(req.query.part_number);
      const current = multipartSessions.get(sessionId);

      if (
        !current ||
        !Number.isSafeInteger(partNumber) ||
        partNumber < 1 ||
        partNumber > current.partCount
      ) {
        res.status(400).json({ error: "Invalid session or part number." });
        return;
      }

      const bodyBuffer = Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from(req.body || "");

      const s3 = createR2Client();
      if (s3) {
        const uploaded = await s3.send(
          new UploadPartCommand({
            Bucket: current.bucket,
            Key: current.key,
            UploadId: current.uploadId,
            PartNumber: partNumber,
            Body: bodyBuffer,
          })
        );
        const etag =
          uploaded.ETag ||
          `"${crypto.createHash("md5").update(bodyBuffer).digest("hex")}"`;
        current.parts.set(partNumber, { ETag: etag });
      } else {
        const etag = `"${crypto
          .createHash("md5")
          .update(bodyBuffer)
          .digest("hex")}"`;
        current.parts.set(partNumber, { ETag: etag, data: bodyBuffer });
      }

      res.status(200).json({ ok: true, partNumber });
    } catch (error) {
      console.error("R2 upload-part error:", error);
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : "Could not upload part to Cloudflare R2.",
      });
    }
  });

  // 4. Single-object upload (covers, posters, product images) to Cloudflare R2
  app.put("/api/r2/upload-object", async (req, res) => {
    try {
      const cfg = getR2Config();
      const s3 = createR2Client();
      const folder = safeFileName(String(req.query.folder || "assets"));
      const fileName = safeFileName(String(req.query.file_name || "file"));
      const bucketParam = String(req.query.bucket || "").trim();
      const bucket =
        bucketParam === "games"
          ? cfg.gamesBucket
          : bucketParam === "films" || bucketParam === "films-free"
            ? cfg.filmsBucket
            : cfg.assetsBucket;

      const contentType =
        String(req.query.content_type || req.headers["content-type"] || "") ||
        "application/octet-stream";

      const key = `${folder}/${crypto.randomUUID()}-${fileName}`;
      const bodyBuffer = Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from(req.body || "");

      if (bodyBuffer.length === 0) {
        res.status(400).json({ error: "Empty file upload." });
        return;
      }

      if (s3) {
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: bodyBuffer,
            ContentType: contentType,
            CacheControl: "public, max-age=3600",
          })
        );
      } else {
        localObjects.set(`${bucket}/${key}`, {
          data: bodyBuffer,
          contentType,
          updatedAt: Date.now(),
        });
      }

      const publicUrl = buildPublicObjectUrl(bucket, key);
      res.json({
        storage_provider: "r2",
        bucket,
        path: key,
        publicUrl,
      });
    } catch (error) {
      console.error("R2 single upload error:", error);
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : "Could not upload file to Cloudflare R2.",
      });
    }
  });

  // 5. Generate signed download URL from Cloudflare R2
  app.post("/api/r2/download-url", async (req, res) => {
    try {
      const cfg = getR2Config();
      const s3 = createR2Client();
      const key = String(req.body?.path || req.body?.key || "").trim();
      const requestedBucket = String(req.body?.bucket || "").trim();
      const bucket =
        !requestedBucket || requestedBucket === "games"
          ? cfg.gamesBucket
          : requestedBucket === "films" || requestedBucket === "films-free"
            ? cfg.filmsBucket
            : requestedBucket;

      if (!key) {
        res.status(400).json({ error: "Object path is required." });
        return;
      }

      const fileName = key.split("/").pop() || "download";

      if (s3) {
        const signedUrl = await getSignedUrl(
          s3,
          new GetObjectCommand({
            Bucket: bucket,
            Key: key,
            ResponseContentDisposition: `attachment; filename="${fileName}"`,
          }),
          { expiresIn: 300 }
        );
        res.json({ url: signedUrl, expires_in: 300, provider: "r2" });
        return;
      }

      const fallbackUrl = `${buildPublicObjectUrl(bucket, key)}?download=1`;
      res.json({ url: fallbackUrl, expires_in: 300, provider: "r2-local" });
    } catch (error) {
      console.error("R2 download-url error:", error);
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : "Could not create Cloudflare R2 download URL.",
      });
    }
  });

  // 6. Delete object(s) from Cloudflare R2
  app.post("/api/r2/delete", async (req, res) => {
    try {
      const cfg = getR2Config();
      const s3 = createR2Client();
      const requestedBucket = String(req.body?.bucket || "").trim();
      const bucket =
        !requestedBucket || requestedBucket === "games"
          ? cfg.gamesBucket
          : requestedBucket === "films" || requestedBucket === "films-free"
            ? cfg.filmsBucket
            : requestedBucket;
      const paths: string[] = Array.isArray(req.body?.paths)
        ? req.body.paths.filter(Boolean)
        : req.body?.path
          ? [String(req.body.path)]
          : [];

      for (const key of paths) {
        if (s3) {
          await s3.send(
            new DeleteObjectCommand({
              Bucket: bucket,
              Key: key,
            })
          );
        }
        localObjects.delete(`${bucket}/${key}`);
      }

      res.json({ ok: true, deleted: paths });
    } catch (error) {
      console.error("R2 delete error:", error);
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : "Could not delete object from Cloudflare R2.",
      });
    }
  });

  // 7. Serve or redirect R2 objects (covers, posters, product images, local downloads)
  app.use("/api/r2/object", async (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }

    try {
      const cfg = getR2Config();
      const s3 = createR2Client();
      const trimmedPath = req.path.replace(/^\/+/, "");
      const slashIndex = trimmedPath.indexOf("/");

      if (slashIndex <= 0) {
        res.status(400).json({ error: "Missing bucket or object key." });
        return;
      }

      const rawBucket = decodeURIComponent(trimmedPath.slice(0, slashIndex));
      const rawKey = trimmedPath.slice(slashIndex + 1);
      const bucket =
        rawBucket === "games"
          ? cfg.gamesBucket
          : rawBucket === "films" || rawBucket === "films-free"
            ? cfg.filmsBucket
            : rawBucket === "product-images" || rawBucket === "assets"
              ? cfg.assetsBucket
              : rawBucket;
      const key = rawKey
        .split("/")
        .map((segment) => decodeURIComponent(segment))
        .join("/");

      const localEntry =
        localObjects.get(`${bucket}/${key}`) ||
        localObjects.get(`${rawBucket}/${key}`);
      if (localEntry) {
        res.setHeader("Content-Type", localEntry.contentType);
        res.setHeader("Cache-Control", "public, max-age=3600");
        if (req.query.download === "1") {
          const filename = key.split("/").pop() || "download";
          res.setHeader(
            "Content-Disposition",
            `attachment; filename="${filename}"`
          );
        }
        res.send(localEntry.data);
        return;
      }

      if (s3) {
        const fileName = key.split("/").pop() || "file";
        const signedUrl = await getSignedUrl(
          s3,
          new GetObjectCommand({
            Bucket: bucket,
            Key: key,
            ...(req.query.download === "1"
              ? {
                  ResponseContentDisposition: `attachment; filename="${fileName}"`,
                }
              : {}),
          }),
          { expiresIn: 3600 }
        );
        res.redirect(302, signedUrl);
        return;
      }

      res.status(404).json({ error: "Object not found in R2 storage." });
    } catch (error) {
      console.error("R2 object fetch error:", error);
      res.status(500).json({ error: "Could not retrieve object from R2." });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.use((_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    const cfg = getR2Config();
    console.log(
      `Server running on http://0.0.0.0:${PORT} (Cloudflare R2 configured: ${cfg.configured})`
    );
  });
}

startServer();
