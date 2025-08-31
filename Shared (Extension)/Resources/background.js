browser.runtime.onInstalled.addListener(() => {
  browser.contextMenus.create({
    id: "copy-actual-image",
    title: "Copy Image to Clipboard",
    contexts: ["image"],
  });
});

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "copy-actual-image") {
    try {
      if (!info.srcUrl) {
        throw new Error("No image URL found");
      }
      if (!tab.url) {
        throw new Error("Cannot access page information");
      }

      let resolvedUrl;
      try {
        const baseUrl = new URL(tab.url);
        const imageUrl = new URL(info.srcUrl, baseUrl);
        resolvedUrl = imageUrl.href;
      } catch (urlError) {
        throw new Error("Invalid image URL");
      }

      const imageResponse = await fetch(resolvedUrl);
      if (!imageResponse.ok) {
        throw new Error(`Unable to access image (HTTP ${imageResponse.status})`);
      }

      const imageBlob = await imageResponse.blob();
      
      const maxSize = 5 * 1024 * 1024; // 5MB limit
      let processedBlob = imageBlob;

      if (imageBlob.size > maxSize) {
        processedBlob = await resizeImage(imageBlob, 2048, 2048);
      }

      const base64String = await blobToBase64Chunked(processedBlob);

      const response = await browser.runtime.sendNativeMessage({
        action: "copyImageData",
        imageData: base64String,
        mimeType: processedBlob.type,
      });

      if (response && response.success) {
        browser.tabs.sendMessage(tab.id, {
          action: "showNotification",
          message: "Image copied to clipboard",
          isError: false,
        });
      } else {
        throw new Error(response?.error || "Copy operation failed");
      }
    } catch (error) {
      browser.tabs.sendMessage(tab.id, {
        action: "showNotification",
        message: "Unable to copy image: " + error.message,
        isError: true,
      });
    }
  }
});

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.greeting === "hello")
    return Promise.resolve({ farewell: "goodbye" });
});

async function resizeImage(blob, maxWidth, maxHeight) {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.onload = () => {
      let { width, height } = img;

      if (width > maxWidth || height > maxHeight) {
        const aspectRatio = width / height;

        if (width > height) {
          width = maxWidth;
          height = maxWidth / aspectRatio;
        } else {
          height = maxHeight;
          width = maxHeight * aspectRatio;
        }
      }

      canvas.width = width;
      canvas.height = height;

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (resizedBlob) => {
          resolve(resizedBlob);
        },
        "image/jpeg",
        0.85,
      );
    };

    img.src = URL.createObjectURL(blob);
  });
}

async function blobToBase64Chunked(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
