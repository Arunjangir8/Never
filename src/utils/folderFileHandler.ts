import * as fs from "fs";
import * as path from "path";
import { config } from "../config.js";

class FolderFileHandler {
  private root: string;

  constructor(rootPath: string = config.projectPath) {
    // No fs check here, a throw in the constructor kills the CLI on import.
    // index.ts calls verifyRoot() after the banner.
    this.root = path.resolve(rootPath);
  }

  public get rootPath(): string {
    return this.root;
  }

  public verifyRoot(): void {
    if (!fs.existsSync(this.root)) {
      throw new Error(
        `PROJECT_PATH does not exist: ${this.root}\n` +
          `  Set PROJECT_PATH in .env to the folder Optimus should work on.`
      );
    }
  }

  private resolveSafePath(relativePath: string): string {
    const fullPath = path.resolve(this.root, relativePath);
    const rel = path.relative(this.root, fullPath);

    // startsWith(root) is not enough: "/proj-evil" would pass for root "/proj".
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new Error(
        `Access outside PROJECT_PATH is not allowed: ${relativePath}`
      );
    }

    return fullPath;
  }

  // Snapshot before overwrite so /revert works.
  private backup(filePath: string): void {
    if (!config.backupBeforeWrite) return;
    if (!fs.existsSync(filePath)) return;
    fs.copyFileSync(filePath, `${filePath}.optimus.bak`);
  }

  private generateTree(dir: string, prefix = ""): string {
    const items = fs.readdirSync(dir);
    let result = "";

    items.forEach((item, index) => {
      const fullPath = path.join(dir, item);
      const isLast = index === items.length - 1;
      const connector = isLast ? "└── " : "├── ";

      result += `${prefix}${connector}${item}\n`;

      if (fs.statSync(fullPath).isDirectory()) {
        const newPrefix = prefix + (isLast ? "    " : "│   ");
        result += this.generateTree(fullPath, newPrefix);
      }
    });

    return result;
  }

  public getFolderStructure(): string {
    return `${path.basename(this.root)}/\n` + this.generateTree(this.root);
  }

  public readFile(relativePath: string): string {
    const filePath = this.resolveSafePath(relativePath);

    if (!fs.existsSync(filePath)) {
      throw new Error("File not found");
    }

    return fs.readFileSync(filePath, "utf-8");
  }

  public readFileLines(
    relativePath: string,
    startLine: number,
    endLine: number
  ): string {
    const filePath = this.resolveSafePath(relativePath);

    if (!fs.existsSync(filePath)) {
      throw new Error("File not found");
    }

    const fileData = fs.readFileSync(filePath, "utf-8");
    const lines = fileData.split("\n");

    const start = Math.max(startLine - 1, 0);
    const end = Math.min(endLine, lines.length);

    return lines.slice(start, end).join("\n");
  }

  public updateFile(relativePath: string, newContent: string): void {
    const filePath = this.resolveSafePath(relativePath);

    if (!fs.existsSync(filePath) && !config.allowNewFiles) {
      throw new Error(
        `Refusing to create ${relativePath} (ALLOW_NEW_FILES=false)`
      );
    }

    this.backup(filePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, newContent, "utf-8");
  }

  public updateFileLines(
    relativePath: string,
    startLine: number,
    endLine: number,
    newContent: string
  ): void {
    const filePath = this.resolveSafePath(relativePath);

    if (!fs.existsSync(filePath)) {
      throw new Error("File not found");
    }

    const fileData = fs.readFileSync(filePath, "utf-8");
    const lines = fileData.split("\n");

    const start = startLine - 1;
    const deleteCount = endLine - startLine + 1;
    const newLines = newContent.split("\n");

    lines.splice(start, deleteCount, ...newLines);

    this.backup(filePath);
    fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
  }

  public applyPatches(
    relativePath: string,
    patches: { find: string; replace: string }[]
  ): void {
    const filePath = this.resolveSafePath(relativePath);

    if (!fs.existsSync(filePath)) {
      throw new Error("File not found");
    }

    let content = fs.readFileSync(filePath, "utf-8");

    for (const { find, replace } of patches) {
      const count = (content.split(find).length - 1);
      if (count === 0) {
        throw new Error(`Patch target not found in file: ${relativePath}\n>> ${find.slice(0, 80)}`);
      }
      if (count > 1) {
        throw new Error(`Patch target is ambiguous (${count} matches) in: ${relativePath}\n>> ${find.slice(0, 80)}`);
      }
      content = content.replace(find, replace);
    }

    this.backup(filePath);
    fs.writeFileSync(filePath, content, "utf-8");
  }

  public createFile(relativePath: string, content: string = ""): void {
    if (!config.allowNewFiles) {
      throw new Error(
        `Refusing to create ${relativePath} (ALLOW_NEW_FILES=false)`
      );
    }

    const filePath = this.resolveSafePath(relativePath);

    if (fs.existsSync(filePath)) {
      throw new Error("File already exists");
    }

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, "utf-8");
  }

  public revert(relativePath: string): void {
    const filePath = this.resolveSafePath(relativePath);
    const bak = `${filePath}.optimus.bak`;

    if (!fs.existsSync(bak)) {
      throw new Error(
        `No backup found for ${relativePath}. ` +
          `Backups need BACKUP_BEFORE_WRITE=true (default) at the time of the edit.`
      );
    }

    fs.copyFileSync(bak, filePath);
  }
}

export const folderFileHandler = new FolderFileHandler();