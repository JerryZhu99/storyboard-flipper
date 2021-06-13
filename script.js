const STORYBOARD_HEIGHT = 480;

/** @type {HTMLInputElement} */
const fileInput = document.getElementById('file-input');
/** @type {HTMLButtonElement} */
const downloadButton = document.getElementById('download');
/** @type {HTMLParagraphElement} */
const progress = document.getElementById('progress');

const setProgress = (text) => {
  progress.innerText = text;
}

const listImages = (text) => {
  const lines = text.split('\n');
  const startIndex = lines.findIndex(l => l.startsWith('[Events]'));
  let endIndex = lines.findIndex((l, i) => i > startIndex && l.startsWith('['));
  if (endIndex == -1) endIndex = lines.length;

  const paths = [];

  for (let i = startIndex + 1; i < endIndex; i++) {
    const line = lines[i];
    const parts = line.split(',');
    const path = parts[3] && parts[3]
      .replace(/\\\\/g, '\\')
      .replace(/\\/g, '/')
      .replace(/"/g, '');
    if (line.startsWith('Sprite')) {
      paths.push(path);
    } else if (line.startsWith('Animation')) {
      for (let i = 0; i < parseInt(parts[6]); i++) {
        paths.push(path.replace(/(\.[a-zA-Z]+)$/, x => i + x));
      }
    }
  }

  return paths;
}

/**
 * 
 * @param {Blob} blob 
 * @param {string} type 
 * @returns {Blob}
 */
const flipImage = (blob, type) => {
  return new Promise(resolve => {
    var img = new Image();
    img.addEventListener('load', () => {
      let canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      let context = canvas.getContext('2d');
      context.translate(0, img.height)
      context.scale(1, -1);
      context.drawImage(img, 0, 0, img.width, img.height);
      canvas.toBlob(resolve, type);
    });
    img.src = URL.createObjectURL(blob);
  });
}

const transformFile = (text) => {
  const lines = text.split('\n');
  const startIndex = lines.findIndex(l => l.startsWith('[Events]'));
  let endIndex = lines.findIndex((l, i) => i > startIndex && l.startsWith('['));
  if (endIndex == -1) endIndex = lines.length;

  for (let i = startIndex + 1; i < endIndex; i++) {
    lines[i] = transform(lines[i]);
  }

  return lines.join('\n');
}

/**
 * 
 * @param {string} line 
 * @returns {string}
 */
const transform = (line) => {
  if (line.startsWith('Sprite') || line.startsWith('Animation')) {
    const parts = line.split(',');
    parts[2] = parts[2].replace(/(Top|Bottom)/g, x => x === 'Top' ? 'Bottom' : 'Top');
    parts[5] = STORYBOARD_HEIGHT - parts[5];
    return parts.join(',');
  } else if (line[0] === ' ' || line[0] === '_') {
    const parts = line.split(',');
    const command = parts[0].replace(/[_ ]+/g, '');
    switch (command) {
      case 'M': // move
        if (parts[5]) parts[5] = STORYBOARD_HEIGHT - parts[5];
        if (parts[7]) parts[7] = STORYBOARD_HEIGHT - parts[7];
        break;
      case 'MY': // move y
        if (parts[4]) parts[4] = STORYBOARD_HEIGHT - parts[4];
        if (parts[5]) parts[5] = STORYBOARD_HEIGHT - parts[5];
        break;
      case 'R': // rotate
        if (parts[4]) parts[4] = - parts[4];
        if (parts[5]) parts[5] = - parts[5];
        break;
      default:
        return line;
    }
    return parts.join(',');
  }
  return line;
};

fileInput.addEventListener('change', async () => {
  const selectedFile = fileInput.files[0];
  fileInput.disabled = true;
  await loadFiles(selectedFile);
  fileInput.disabled = false;
})

const saveData = (() => {
  const a = document.createElement('a');
  document.body.appendChild(a);
  a.style = 'display: none';
  return (blob, fileName) => {
    url = window.URL.createObjectURL(blob);
    a.href = url;
    a.download = fileName;
    a.click();
    window.URL.revokeObjectURL(url);
  };
})();

/** @param {File} zipFile */
const loadFiles = async (zipFile) => {
  setProgress('Loading .osz file...');
  const zip = await JSZip.loadAsync(zipFile);

  const files = [];
  zip.forEach((path, file) => files.push([path, file]));

  setProgress('Updating storyboards...');

  let imagePaths = [];

  await Promise.all(files.map(async ([path, file]) => {
    if (path.endsWith('.osu') || path.endsWith('.osb')) {
      const content = await file.async('text');
      const transformed = transformFile(content);
      const images = listImages(content);
      imagePaths = imagePaths.concat(images);
      await zip.file(path, transformed);
    }
  }));


  const imageSet = [...new Set(imagePaths)];

  let completed = 0;
  setProgress(`Flipping images... (${completed}/${imageSet.length})`);
  await Promise.all(imageSet.map(async path => {
    const blob = await zip.file(path).async('blob');
    const type = {
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
    }[path.match(/\.([a-zA-Z]+)$/)[0].trim().toLowerCase()];
    const transformed = await flipImage(blob, type);
    await zip.file(path, transformed);
    completed++;
    setProgress(`Flipping images... (${completed}/${imageSet.length})`);
  }));

  setProgress('Generating zip... (0%)');

  const blob = await zip.generateAsync({ type: 'blob' }, (metadata) => {
    setProgress(`Generating zip... (${metadata.percent.toFixed(0)}%)`);
  });

  setProgress('Done!');
  saveData(blob, zipFile.name);
}






// textOutput.value = textInput.value.split('\n').map(transform).join('\n');
