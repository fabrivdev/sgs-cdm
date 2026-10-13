export interface SourceFileIdentity {
  fileName: string;
  byteSize: number;
  sha256: string;
}

export async function sha256Hex(file: Blob) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("El navegador no permite calcular SHA-256 para identificar el archivo.");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function identifySourceFile(file: File): Promise<SourceFileIdentity> {
  return {
    fileName: file.name,
    byteSize: file.size,
    sha256: await sha256Hex(file),
  };
}
