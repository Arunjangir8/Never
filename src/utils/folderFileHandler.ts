import * as fs from "fs";
import * as path from "path";

const ROOT_FOLDER = path.join(process.cwd(), "my-project");

class FolderFileHandler {
  private root: string;

  constructor(rootPath: string = ROOT_FOLDER) {
    this.root = path.resolve(rootPath);

    if (!fs.existsSync(this.root)) {
      throw new Error("my-project folder not found");
    }
  }

  private resolveSafePath(relativePath: string): string {
    const fullPath = path.resolve(this.root, relativePath);

    if (!fullPath.startsWith(this.root)) {
      console.error(`Attempted access outside root: ${fullPath}`);
      console.error(`Root path: ${this.root}`);
      throw new Error("Access outside root is not allowed");
    }

    return fullPath;
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

    fs.writeFileSync(filePath, content, "utf-8");
  }


  public createFile(relativePath: string, content: string = ""): void {
    const filePath = this.resolveSafePath(relativePath);

    if (fs.existsSync(filePath)) {
      throw new Error("File already exists");
    }

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, "utf-8");
  }
}

export const folderFileHandler = new FolderFileHandler();