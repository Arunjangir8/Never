import * as fs from "fs";
import * as path from "path";

const ROOT_FOLDER = path.join(process.cwd(), "my-project");

class FolderFileHandler {
  private root: string;

  constructor(rootPath: string = ROOT_FOLDER) {
    this.root = rootPath;

    if (!fs.existsSync(this.root)) {
      throw new Error("my-project folder not found");
    }
  }

  private resolveSafePath(relativePath: string): string {
    const fullPath = path.join(this.root, relativePath);

    if (!fullPath.startsWith(this.root)) {
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

    // Convert to 0-based index
    const start = Math.max(startLine - 1, 0);
    const end = Math.min(endLine, lines.length);

    return lines.slice(start, end).join("\n");
  }

  public updateFile(
    relativePath: string,
    newContent: string
  ): void {
    const filePath = this.resolveSafePath(relativePath);

    if (!fs.existsSync(filePath)) {
      throw new Error("File not found");
    }

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

    // Convert to 0-based index
    const start = startLine - 1;
    const end = endLine;

    // Replace lines
    lines.splice(start, end - start, newContent);

    fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
  }
}

export const folderFileHandler = new FolderFileHandler();