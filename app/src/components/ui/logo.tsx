import Image from "next/image";

/**
 * The NAAMII logo (full-colour version, for a white background — brand contrast
 * rule). On dark surfaces it is shown on a white tile rather than recoloured.
 * Source file: public/brand/naamii-logo.png (469 × 157).
 */
export function NaamiiLogo({ width = 180, priority = false }: { width?: number; priority?: boolean }) {
  return <Image src="/brand/naamii-logo.png" alt="NAAMII — Multi-disciplinary AI Center of Excellence" width={width} height={Math.round((width * 157) / 469)} priority={priority} unoptimized />;
}
