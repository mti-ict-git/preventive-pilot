import UPNG from "@pdf-lib/upng";
import { decode as decodeJpeg } from "jpeg-js";

export type LogoViewport = { x: number; y: number; width: number; height: number; imageWidth: number; imageHeight: number };
let last: { dataUrl: string; viewport: LogoViewport } | undefined;
// Only outer transparent/near-white space is omitted; the original image is preserved.
export const getLogoViewport = (dataUrl: string): LogoViewport => {
  if (last?.dataUrl === dataUrl) return last.viewport;
  const encoded = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
  let width: number, height: number, pixels: Uint8Array;
  if (dataUrl.startsWith("data:image/png")) {
    if (bytes.length < 24) throw new Error("The logo cannot be read. Upload a valid PNG or JPG image.");
    const header = new DataView(bytes.buffer);
    width = header.getUint32(16); height = header.getUint32(20);
    if (width * height > 16000000) throw new Error("Logo resolution is too large. Use up to 16 megapixels.");
    const decoded = UPNG.decode(bytes.buffer);pixels = new Uint8Array(UPNG.toRGBA8(decoded)[0]);
    width = decoded.width; height = decoded.height;
  } else {
    const decoded = decodeJpeg(bytes, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 16, maxMemoryUsageInMB: 128 });
    width = decoded.width; height = decoded.height; pixels = decoded.data;
  }
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4, alpha = pixels[i + 3] / 255;
    const ink = alpha > 0.05 && (255 - (255 - pixels[i]) * alpha < 242 || 255 - (255 - pixels[i + 1]) * alpha < 242 || 255 - (255 - pixels[i + 2]) * alpha < 242);
    if (ink) {left = Math.min(left, x);right = Math.max(right, x);top = Math.min(top, y);bottom = Math.max(bottom, y);}
  }
  if (right < 0) throw new Error("The logo is blank on white. Upload a visible logo.");
  left = Math.max(0, left - 2);top = Math.max(0, top - 2);right = Math.min(width - 1, right + 2);bottom = Math.min(height - 1, bottom + 2);
  const viewport = {x:left,y:top,width:right-left+1,height:bottom-top+1,imageWidth:width,imageHeight:height};
  last = {dataUrl,viewport};return viewport;
};

