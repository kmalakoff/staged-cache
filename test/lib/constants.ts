import path from 'path';
import url from 'url';

const ___filename = typeof __filename !== 'undefined' ? __filename : url.fileURLToPath(import.meta.url);

export const TMP_DIR = path.join(path.dirname(___filename), '..', '..', '.tmp');
