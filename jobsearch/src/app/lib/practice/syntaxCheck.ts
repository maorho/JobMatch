import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * "Does this even compile?" — run before a timed submission is graded, so a
 * candidate can go back and fix a stray bracket instead of losing the attempt
 * to a syntax error. TypeScript/JavaScript are checked in-process with the
 * TypeScript compiler (syntax + the obvious semantic errors such as an unknown
 * name or a wrong call), Python and bash by their interpreters when present.
 * Never blocks a submission: the UI offers "submit anyway".
 */
export type SyntaxIssue = { line: number; column: number; message: string };
export type SyntaxReport = { supported: boolean; ok: boolean; checker: string; issues: SyntaxIssue[] };

const MAX_ISSUES = 12;
/** TypeScript error codes that are about the environment, not the candidate's code. */
const IGNORED_TS_CODES = new Set([
  2307, // Cannot find module
  2792, // Cannot find module … did you mean to set moduleResolution
  1479, // current file is a CommonJS module …
  2580, // Cannot find name 'require' / 'process' … install @types/node
  2591, // same, with "Do you need to install type definitions"
  2584, // Cannot find name 'console' … change lib
  7006, // implicit any (we do not grade types strictly)
  7031, // binding element implicitly has an 'any' type
  2339, // property does not exist on type — too noisy with untyped starter code
  2345, // argument of type — same
  2322, // type … is not assignable — same
]);

export function normalizeLanguage(language: string): "typescript" | "javascript" | "python" | "bash" | "other" {
  const l = (language || "").toLowerCase().trim();
  if (["typescript", "ts", "tsx"].includes(l)) return "typescript";
  if (["javascript", "js", "jsx", "node", "node.js"].includes(l)) return "javascript";
  if (["python", "py", "python3"].includes(l)) return "python";
  if (["bash", "sh", "shell", "zsh"].includes(l)) return "bash";
  return "other";
}

async function checkTypeScript(code: string, js: boolean): Promise<SyntaxReport> {
  const ts = await import("typescript");
  const fileName = js ? "answer.js" : "answer.ts";
  const options: import("typescript").CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
    strict: false,
    noImplicitAny: false,
    allowJs: true,
    checkJs: js,
    skipLibCheck: true,
    noEmit: true,
    jsx: ts.JsxEmit.Preserve,
    isolatedModules: false,
  };
  const host = ts.createCompilerHost(options, true);
  const readFile = host.readFile;
  const fileExists = host.fileExists;
  host.readFile = (f) => (path.basename(f) === fileName ? code : readFile(f));
  host.fileExists = (f) => path.basename(f) === fileName || fileExists(f);
  host.getSourceFile = (f, lang, onError) => {
    if (path.basename(f) === fileName) return ts.createSourceFile(f, code, lang, true, js ? ts.ScriptKind.JS : ts.ScriptKind.TS);
    const text = readFile(f);
    return text === undefined ? undefined : ts.createSourceFile(f, text, lang, true);
  };
  host.writeFile = () => {};
  const program = ts.createProgram([fileName], options, host);
  const sf = program.getSourceFile(fileName);
  const diags = [...program.getSyntacticDiagnostics(sf), ...program.getSemanticDiagnostics(sf)].filter((d) => d.category === ts.DiagnosticCategory.Error && !IGNORED_TS_CODES.has(d.code));
  const issues: SyntaxIssue[] = diags.slice(0, MAX_ISSUES).map((d) => {
    const pos = d.file && d.start != null ? d.file.getLineAndCharacterOfPosition(d.start) : { line: 0, character: 0 };
    return { line: pos.line + 1, column: pos.character + 1, message: ts.flattenDiagnosticMessageText(d.messageText, "\n") };
  });
  return { supported: true, ok: issues.length === 0, checker: `typescript ${ts.version}`, issues };
}

/** Run an interpreter's parse-only mode on a temp file; `null` when the binary is not on this machine. */
async function checkWithBinary(bin: string, argsFor: (file: string) => string[], ext: string, code: string, parse: (stderr: string) => SyntaxIssue[]): Promise<SyntaxReport | null> {
  const dir = await mkdtemp(path.join(tmpdir(), "jm-syntax-"));
  const file = path.join(dir, `answer.${ext}`);
  try {
    await writeFile(file, code, "utf8");
    const out = await new Promise<{ code: number | null; stderr: string } | null>((resolve) => {
      let stderr = "";
      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(bin, argsFor(file), { stdio: ["ignore", "ignore", "pipe"], timeout: 8000 });
      } catch {
        return resolve(null);
      }
      child.on("error", () => resolve(null));
      child.stderr?.on("data", (b) => (stderr += String(b)));
      child.on("close", (c) => resolve({ code: c, stderr }));
    });
    if (!out) return null;
    const issues = out.code === 0 ? [] : parse(out.stderr).slice(0, MAX_ISSUES);
    if (out.code !== 0 && !issues.length) issues.push({ line: 0, column: 0, message: out.stderr.trim().split("\n").slice(-1)[0] || "syntax error" });
    return { supported: true, ok: out.code === 0, checker: bin, issues };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

const pythonIssues = (stderr: string): SyntaxIssue[] => {
  // py_compile prints:  File "…/answer.py", line 3 \n … \n SyntaxError: invalid syntax
  const line = Number(stderr.match(/line (\d+)/)?.[1] || 0);
  const msg = stderr.match(/(\w+Error: .*)$/m)?.[1] || stderr.trim().split("\n").slice(-1)[0] || "syntax error";
  return [{ line, column: 0, message: msg }];
};
const bashIssues = (stderr: string): SyntaxIssue[] =>
  stderr
    .split("\n")
    .filter(Boolean)
    .map((l) => ({ line: Number(l.match(/line (\d+)/)?.[1] || 0), column: 0, message: l.replace(/^.*?: line \d+: /, "") }));

export async function checkSyntax(language: string, code: string): Promise<SyntaxReport> {
  const src = String(code || "");
  if (!src.trim()) return { supported: true, ok: false, checker: "empty", issues: [{ line: 0, column: 0, message: "empty answer" }] };
  const lang = normalizeLanguage(language);
  if (lang === "typescript" || lang === "javascript") return checkTypeScript(src, lang === "javascript");
  if (lang === "python") return (await checkWithBinary("python3", (f) => ["-m", "py_compile", f], "py", src, pythonIssues)) ?? { supported: false, ok: true, checker: "none", issues: [] };
  if (lang === "bash") return (await checkWithBinary("bash", (f) => ["-n", f], "sh", src, bashIssues)) ?? { supported: false, ok: true, checker: "none", issues: [] };
  return { supported: false, ok: true, checker: "none", issues: [] };
}
