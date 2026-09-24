import fs from "fs";
import path from "path";
import "dotenv/config";
import { BatchCaseInput, BatchCaseResult, BatchOutput } from "../core/types.js";
import { generateInterviewPrepKit } from "../core/pipeline.js";
import { validateBatchCasesInput, validateBatchOutput } from "../core/validator/kitValidator.js";

// Ensure local test URLs are permitted for batch evaluation (Section 9)
process.env.ALLOW_LOCAL_URLS = "true";

function parseCliArgs(): { inputPath: string; outputPath: string } {
  const args = process.argv.slice(2);
  let inputPath = "";
  let outputPath = "";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--input" && i + 1 < args.length) {
      inputPath = args[i + 1];
      i++;
    } else if (arg.startsWith("--input=")) {
      inputPath = arg.substring("--input=".length);
    } else if (arg === "--output" && i + 1 < args.length) {
      outputPath = args[i + 1];
      i++;
    } else if (arg.startsWith("--output=")) {
      outputPath = arg.substring("--output=".length);
    }
  }

  if (!inputPath || !outputPath) {
    console.error(
      "Usage: npm run evaluate -- --input <cases.json> --output <kits.json>"
    );
    process.exit(1);
  }

  return {
    inputPath: path.resolve(process.cwd(), inputPath),
    outputPath: path.resolve(process.cwd(), outputPath),
  };
}

async function runBatchEvaluation() {
  const { inputPath, outputPath } = parseCliArgs();

  console.log(`\n======================================================`);
  console.log(` PrepKIT - Batch Processing & Evaluation Runner `);
  console.log(`======================================================\n`);
  console.log(`Input cases file:  ${inputPath}`);
  console.log(`Output kits file: ${outputPath}`);

  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input file does not exist at "${inputPath}"`);
    process.exit(1);
  }

  let rawCasesData: unknown;
  try {
    const fileContent = fs.readFileSync(inputPath, "utf-8");
    rawCasesData = JSON.parse(fileContent);
  } catch (err) {
    console.error(`Error: Failed to read or parse input JSON: ${(err as Error).message}`);
    process.exit(1);
  }

  const validation = validateBatchCasesInput(rawCasesData);
  if (!validation.success || !validation.data) {
    console.error("Input validation failed:", validation.errors);
    process.exit(1);
  }

  const cases: BatchCaseInput[] = validation.data;
  console.log(`Loaded ${cases.length} case(s) for evaluation.\n`);

  const results: BatchCaseResult[] = [];

  for (let i = 0; i < cases.length; i++) {
    const item = cases[i];
    console.log(
      `[${i + 1}/${cases.length}] Processing case "${item.id}" (Company: ${item.company_url}, Days: ${item.days})...`
    );

    try {
      const kit = await generateInterviewPrepKit({
        jd: item.jd,
        company_url: item.company_url,
        days: item.days,
        allowLocalhost: true,
        onProgress: (p) => {
          process.stdout.write(`  -> [${p.stage}] ${p.message}\r`);
        },
      });

      console.log(`\n  ✓ Successfully generated kit for "${item.id}".`);

      results.push({
        id: item.id,
        status: "ok",
        kit,
        error: null,
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`\n  ✗ Case "${item.id}" failed: ${errMsg}`);

      // Determine error code
      let code = "PIPELINE_ERROR";
      if (errMsg.toLowerCase().includes("unreachable")) {
        code = "COMPANY_UNREACHABLE";
      } else if (errMsg.toLowerCase().includes("rate limit")) {
        code = "RATE_LIMIT_EXCEEDED";
      } else if (errMsg.toLowerCase().includes("validation")) {
        code = "VALIDATION_FAILED";
      }

      results.push({
        id: item.id,
        status: "failed",
        kit: null,
        error: {
          code,
          message: errMsg,
        },
      });
    }
  }

  // Construct batch output matching Appendix B
  const batchOutput: BatchOutput = {
    version: "1.0",
    generated_at: new Date().toISOString(),
    kits: results,
  };

  const outputValidation = validateBatchOutput(batchOutput);
  if (!outputValidation.success) {
    console.error(
      "Warning: Output failed Appendix B schema validation:",
      outputValidation.errors
    );
  }

  // Ensure output directory exists
  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(batchOutput, null, 2), "utf-8");
  console.log(`\n======================================================`);
  console.log(` Batch evaluation finished. Kits written to:`);
  console.log(` ${outputPath}`);
  console.log(` Summary: ${results.filter((r) => r.status === "ok").length} ok, ${results.filter((r) => r.status === "failed").length} failed.`);
  console.log(`======================================================\n`);
}

runBatchEvaluation().catch((err) => {
  console.error("Fatal error in batch evaluator:", err);
  process.exit(1);
});
