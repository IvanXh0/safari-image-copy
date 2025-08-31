function showNotification(message, isError = false) {
  const notification = document.createElement("div");
  notification.textContent = message;
  notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${isError ? "#f44336" : "#4caf50"};
        color: white;
        padding: 12px 24px;
        border-radius: 4px;
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        box-shadow: 0 4px 8px rgba(0,0,0,0.2);
        transition: opacity 0.3s ease;
    `;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.opacity = "0";
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 300);
  }, 3000);
}


async function downloadImage(imageUrl) {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;

    let filename = "image";
    try {
      const urlPath = new URL(imageUrl).pathname;
      const urlFilename = urlPath.split("/").pop();
      if (urlFilename && urlFilename.includes(".")) {
        filename = urlFilename;
      } else {
        const extension = blob.type.split("/")[1] || "png";
        filename = `image.${extension}`;
      }
    } catch {
      filename = "image.png";
    }

    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    throw error;
  }
}

async function copyImageWithUserInteraction(imageUrl) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const img = new Image();

  img.crossOrigin = "anonymous";

  return new Promise((resolve, reject) => {
    img.onload = () => {
      try {
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        ctx.drawImage(img, 0, 0);

        canvas.toBlob(async (blob) => {
          if (!blob) {
            reject(new Error("Failed to create blob"));
            return;
          }

          setTimeout(async () => {
            try {
              await navigator.clipboard.write([
                new ClipboardItem({
                  [blob.type]: blob,
                }),
              ]);
              resolve();
            } catch (clipboardError) {
              reject(clipboardError);
            }
          }, 0);
        }, "image/png");
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = imageUrl;
  });
}

async function copyImageToClipboard(imageUrl) {
  try {
    const imagePromise = fetch(imageUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.blob();
      });

    const clipboardItem = new ClipboardItem({
      "image/png": imagePromise,
    });

    await navigator.clipboard.write([clipboardItem]);
    showNotification("Image copied to clipboard");
  } catch (error) {
    showNotification("Failed to copy image: " + error.message, true);
  }
}

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "showNotification") {
    showNotification(request.message, request.isError || false);
  } else if (request.action === "copyImageFallback") {
    copyImageToClipboard(request.imageUrl);
  }
});
