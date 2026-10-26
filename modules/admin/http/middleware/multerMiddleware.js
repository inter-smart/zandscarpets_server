const multer = require("multer");
const path = require("path");
const fs = require("fs");
const fsPromises = require("fs").promises;
const { CustomError } = require("../traits/responseHandler");

const getStorage = (subfolder) => {
  const uploadPath = path.join("uploads", subfolder);

  if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
  }

  return multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname);
      cb(null, `${uniqueSuffix}${ext}`);
    },
  });
};

const isValidUrl = (string) => {
  if (!string || typeof string !== "string") {
    return false;
  }
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
};

const extractFilePathFromUrl = (url, subfolder) => {
  if (!url || typeof url !== "string") return null;
  // Match URLs containing the expected file path pattern
  const regex = new RegExp(`https?://[^/]+/(uploads/${subfolder}/[^\\s]+)`);
  const match = url.match(regex);
  return match ? match[1].replace(/\\/g, "/") : null;
};

// options.allowPdf also accepts PDF documents (e.g. product data sheets).
// options.onlyPdf restricts this instance to PDFs exclusively (used for the
// product data sheet upload, kept separate from the main product image
// upload so the main/list images stay image-only).
// options.iconOnly restricts the instance to SVG files (social icons).
// options.imageOnly restricts this instance to jpeg/png/webp images (no svg/video).
// options.maxFileSizeBytes overrides the default 5MB ceiling for this
// instance only (e.g. detail-media raises it to fit a 10MB video, while
// every other caller keeps the original 5MB default).
const createUploadMiddleware = (subfolder, fields, options = {}) => {
  const allowedTypes = options.imageOnly
    ? /jpeg|jpg|png|webp/
    : options.onlyPdf
    ? /pdf/
    : options.iconOnly
    ? /svg/
    : options.allowPdf
    ? /jpeg|jpg|png|svg|webp|mp4|mov|avi|mkv|webm|pdf/
    : /jpeg|jpg|png|svg|webp|mp4|mov|avi|mkv|webm/;
  const typeError = options.imageOnly
    ? "Only image (jpeg, jpg, png, webp) files are allowed"
    : options.onlyPdf
    ? "Only PDF files are allowed"
    : options.iconOnly
    ? "Only SVG icons are allowed"
    : options.allowPdf
    ? "Only image (jpeg, jpg, png, svg, webp), video (mp4, mov, avi, mkv, webm) or PDF files are allowed"
    : "Only image (jpeg, jpg, png, svg, webp) or video (mp4, mov, avi, mkv, webm) files are allowed";

  const upload = multer({
    storage: getStorage(subfolder),
    fileFilter: (req, file, cb) => {
      const extname = allowedTypes.test(
        path.extname(file.originalname).toLowerCase()
      );
      const mimetype = allowedTypes.test(file.mimetype);

      if (extname && mimetype) {
        return cb(null, true);
      }
      cb(
        new CustomError(
          typeError,
          400,
          "INVALID_FILE_TYPE"
        )
      );
    },
    limits: {
      fileSize: options.maxFileSizeBytes ?? 5 * 1024 * 1024, // 5MB default
    },
  });

  return (req, res, next) => {
    // console.log("Incoming req.body:", req.body);
    // console.log("Incoming req.files:", req.files);

    upload.any()(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        return next(new CustomError(err.message, 400, "MULTER_ERROR"));
      } else if (err) {
        return next(err);
      }

      const normalizedBody = { ...req.body };

      // Convert req.files array to object for easier access
      const filesObj = {};
      if (req.files && Array.isArray(req.files)) {
        req.files.forEach(file => {
          if (!filesObj[file.fieldname]) {
            filesObj[file.fieldname] = [];
          }
          filesObj[file.fieldname].push(file);
        });
      }
      req.files = filesObj;

      fields.forEach((field) => {
        const fieldName = field.name;

        if (req.files && req.files[fieldName]) {
          // File was uploaded; use the file path
          const file = req.files[fieldName][0];
          normalizedBody[fieldName] = path
            .join("uploads", subfolder, file.filename)
            .replace(/\\/g, "/");
        } else {
          let input = req.body[fieldName];

          // Handle array inputs (e.g., client sends multiple values)
          if (Array.isArray(input)) {
            console.warn(
              `Array input for ${fieldName}: ${JSON.stringify(input)}`
            );
            input =
              input.find(
                (val) => isValidUrl(val) || (typeof val === "string" && val)
              ) || undefined;
          }

          if (input) {
            // Check if the input is a URL containing a valid file path
            const extractedPath = extractFilePathFromUrl(input, subfolder);
            if (extractedPath) {
              normalizedBody[fieldName] = extractedPath;
            } else if (isValidUrl(input)) {
              // Keep valid external URLs
              normalizedBody[fieldName] = input;
            } else if (input.startsWith(`uploads/${subfolder}/`)) {
              // Already-normalized relative path (e.g. unchanged existing
              // file sent back on update without a new upload)
              normalizedBody[fieldName] = input;
            } else {
              console.warn(`Invalid URL for ${fieldName}: ${input}`);
              normalizedBody[fieldName] = undefined; // Let controller handle
            }
          } else {
            normalizedBody[fieldName] = undefined; // No input provided
          }
        }
      });

      req.body = normalizedBody;
      next();
    });
  };
};

const getRelativeFilePath = (subfolder, filename) => {
  return path.join("uploads", subfolder, filename).replace(/\\/g, "/");
};

const deleteOldFile = async (filePath) => {
  if (!filePath) return;

  try {
    const fullPath = path.join(process.cwd(), filePath);
    if (fs.existsSync(fullPath)) {
      await fsPromises.unlink(fullPath);
    }
  } catch (error) {
    console.error(`Failed to delete old file: ${fullPath}`, error);
  }
};

const deleteOldFiles = async (existingData, newFiles, fields) => {
  try {
    for (const field of fields) {
      const oldFilePath = existingData[field.name];
      const newFilePath = newFiles[field.name];

      if (
        oldFilePath &&
        newFilePath &&
        oldFilePath !== newFilePath &&
        !isValidUrl(newFilePath)
      ) {
        await deleteOldFile(oldFilePath);
      }
    }
  } catch (err) {
    console.error("Failed to delete old files:", err);
  }
};

function handleFileUploadStore(req, fileFields) {
  fileFields.forEach(field => {
    if (req.files?.[field]?.[0]) {
      req.body[field] = req.files[field][0].path;
    }
  });
}

async function handleFileUploadUpdate(req, data, fileFields = []) {
  for (const field of fileFields) {
    if (req.files?.[field]?.length > 0) {
      const newFile = req.files[field][0];

      if (data && data[field]) {
        try {
          await deleteOldFile(data[field]);
        } catch (error) {
          console.error(`Failed to delete old file for field "${field}":`, error);
        }
      }

      req.body[field] = newFile.path;
    }
  }
}

module.exports = {
  createUploadMiddleware,
  getStorage,
  getRelativeFilePath,
  deleteOldFiles,
  deleteOldFile,
  handleFileUploadStore,
  handleFileUploadUpdate,
};
