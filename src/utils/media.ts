export function validateMimeType(mimeType: string): boolean {
  const mimeTypePattern = /(?<type>\w+)\/(?<subtype>[\w.-]+)(?:\+(?<suffix>[\w.-]+))*(?:\s*;\s*(?<key>[^=]+?)(?:=""?(?<value>[\S.-]+?)""?)?)*$/;
  return mimeTypePattern.test(mimeType);
}
export function decodeMimeTypeWithParams(mimeType: string): { type: string; params: Record<string, string> } | undefined {
  if (!validateMimeType(mimeType)) {
    return undefined;
  }
  const [type, ...paramPairs] = mimeType?.split(";") || [];

  if (!type) { 
    return undefined;
  }
  
  const params: Record<string, string> = {};

  for (const pair of paramPairs) {
    const [key, value] = pair.trim().split("=");
    if (key && value) {
      params[key] = value;
    }
  }

  return { type: type.trim(), params };
}