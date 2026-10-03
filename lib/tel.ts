/** A tel: link that keeps the extension: the main number, a pause (comma), then the extension digits. */
export function telHref(phone: string) {
  const [main, ext] = phone.split(/ext\.?/i);
  const digits = main.replace(/[^\d+]/g, "");
  const extension = ext?.replace(/\D/g, "");
  return `tel:${digits}${extension ? `,${extension}` : ""}`;
}
