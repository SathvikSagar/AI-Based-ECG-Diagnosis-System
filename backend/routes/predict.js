import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { runPythonScript } from '../utils/runPython.js';

const router = express.Router();

// Determine __dirname in ES module context and set directories relative to this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// uploads directory (create if missing) — resolve relative to backend folder (avoid backend/backend)
const uploadsDir = path.resolve(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '-')}`)
});
// limit to 10MB and accept any field name (handle in handler)
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

router.post("/", upload.any(), async (req, res) => {
  try {
    const file = req.files?.[0];

    if (!file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded"
      });
    }

    if (!file.mimetype.startsWith("image/")) {
      return res.status(400).json({
        success: false,
        message: "Uploaded file must be an image"
      });
    }

    const filePath = file.path;

    let script = path.resolve(__dirname, "..", "ml", "predict_ecg.py");

    if (!fs.existsSync(script)) {
      script = path.resolve(process.cwd(), "ml", "predict_ecg.py");
    }

    if (!fs.existsSync(script)) {
      return res.status(500).json({
        success: false,
        message: "Prediction script not found"
      });
    }

    console.log("Using Python:", script);

    const result = await runPythonScript(script, [filePath], {
      timeoutMS: 30000,
    });

    console.log("Exit Code:", result.code);
    console.log("STDOUT:", result.stdout);
    console.log("STDERR:", result.stderr);

    if (result.code !== 0) {
      return res.status(500).json({
        success: false,
        message: "Python execution failed",
        stderr: result.stderr,
        stdout: result.stdout
      });
    }

    const parsed = JSON.parse(result.stdout);

    console.log("Prediction Response:", parsed);

    return res.status(200).json({
      success: true,
      message: "Prediction completed successfully",
      result: parsed
    });

  } catch (err) {
    console.error("Prediction Route Error:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
      stack: err.stack
    });
  }
});

export default router;