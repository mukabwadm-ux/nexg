import 'server-only';
import { HostWorkspaceError } from './access';

export const maxModelBytes = 12 * 1024 * 1024;
const signature = 0x46546c67;
const jsonChunk = 0x4e4f534a;
const binaryChunk = 0x004e4942;

function invalid(detail = 'Choose a valid self-contained GLB model.') {
  return new HostWorkspaceError(400, detail);
}

export function validateGlb(bytes: Buffer) {
  if (
    bytes.length < 32 ||
    bytes.length > maxModelBytes ||
    bytes.readUInt32LE(0) !== signature ||
    bytes.readUInt32LE(4) !== 2 ||
    bytes.readUInt32LE(8) !== bytes.length ||
    bytes.readUInt32LE(16) !== jsonChunk
  ) {
    throw invalid();
  }
  const jsonLength = bytes.readUInt32LE(12);
  const end = 20 + jsonLength;
  if (
    jsonLength % 4 ||
    jsonLength > 1_048_576 ||
    end + 8 > bytes.length ||
    bytes.readUInt32LE(end + 4) !== binaryChunk ||
    bytes.readUInt32LE(end) !== bytes.length - end - 8
  ) {
    throw invalid();
  }
  let metadata: {
    asset?: { version?: string };
    buffers?: { uri?: string; byteLength?: number }[];
    images?: { uri?: string; bufferView?: number }[];
    meshes?: unknown[];
    nodes?: unknown[];
    extensionsUsed?: string[];
    extensionsRequired?: string[];
  };
  try {
    metadata = JSON.parse(bytes.toString('utf8', 20, end)) as typeof metadata;
  } catch {
    throw invalid();
  }
  if (
    !metadata?.asset ||
    metadata.asset.version !== '2.0' ||
    !Array.isArray(metadata.buffers) ||
    metadata.buffers.length !== 1 ||
    !metadata.buffers[0] ||
    metadata.buffers[0].uri !== undefined ||
    !Number.isSafeInteger(metadata.buffers[0].byteLength) ||
    (metadata.buffers[0].byteLength ?? 0) < 1 ||
    (metadata.buffers[0].byteLength ?? 0) > bytes.length - end - 8 ||
    !Array.isArray(metadata.meshes) ||
    !metadata.meshes.length ||
    metadata.meshes.length > 1000 ||
    !Array.isArray(metadata.nodes) ||
    metadata.nodes.length > 3000
  )
    throw invalid();
  if (
    metadata.images &&
    (!Array.isArray(metadata.images) ||
      metadata.images.length > 64 ||
      metadata.images.some(
        (image) => !image || image.uri !== undefined || !Number.isInteger(image.bufferView),
      ))
  ) {
    throw invalid('Embed the model textures in the GLB file.');
  }
  const extensions = [metadata.extensionsUsed ?? [], metadata.extensionsRequired ?? []];
  if (
    extensions.some(
      (list) =>
        !Array.isArray(list) ||
        list.some(
          (value) => typeof value !== 'string' || /draco|meshopt|basisu|webp|avif/i.test(value),
        ),
    )
  ) {
    throw invalid('Export the GLB without compressed geometry or special texture extensions.');
  }
}
