const IMAGE_CONFIG = {
  MAX_SIZE: 5 * 1024 * 1024, // 5MB limit
  MAX_WIDTH: 2048,
  MAX_HEIGHT: 2048,
  JPEG_QUALITY: 0.85,
};

/**
 * Resizes an image blob if it exceeds maximum dimensions
 */
async function resizeImage(
  blob,
  maxWidth = IMAGE_CONFIG.MAX_WIDTH,
  maxHeight = IMAGE_CONFIG.MAX_HEIGHT,
) {
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
        (resizedBlob) => resolve(resizedBlob),
        "image/jpeg",
        IMAGE_CONFIG.JPEG_QUALITY,
      );
    };

    img.src = URL.createObjectURL(blob);
  });
}

/**
 * Converts blob to base64 string
 */
async function blobToBase64(blob) {
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

/**
 * Processes image blob - resizes if needed and converts to base64
 */
async function processImageBlob(imageBlob) {
  let processedBlob = imageBlob;

  if (imageBlob.size > IMAGE_CONFIG.MAX_SIZE) {
    processedBlob = await resizeImage(imageBlob);
  }

  const base64String = await blobToBase64(processedBlob);

  return {
    base64: base64String,
    blob: processedBlob,
  };
}

/**
 * Resolves a potentially relative image URL against a base URL
 */
function resolveImageUrl(imageUrl, baseUrl) {
  try {
    const base = new URL(baseUrl);
    const resolved = new URL(imageUrl, base);
    return resolved.href;
  } catch (error) {
    throw new Error("Invalid image URL");
  }
}

/**
 * Fetches an image from URL with proper error handling
 */
async function fetchImage(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Unable to access image (HTTP ${response.status})`);
  }

  return await response.blob();
}

/**
 * Sends a native message to copy image data to clipboard
 */
async function sendCopyImageMessage(base64Data, mimeType) {
  return await browser.runtime.sendNativeMessage({
    action: "copyImageData",
    imageData: base64Data,
    mimeType: mimeType,
  });
}

/**
 * Shows notification to user via content script
 */
function showNotification(tabId, message, isError = false) {
  browser.tabs.sendMessage(tabId, {
    action: "showNotification",
    message: message,
    isError: isError,
  });
}

/**
 * Handles the response from native messaging
 */
function handleNativeResponse(response, tabId) {
  if (response && response.success) {
    showNotification(tabId, "Image copied to clipboard", false);
  } else {
    const error = response?.error || "Copy operation failed";
    showNotification(tabId, "Unable to copy image: " + error, true);
  }
}

// Context menu setup
browser.runtime.onInstalled.addListener(() => {
  browser.contextMenus.create({
    id: "copy-image",
    title: "Copy Image to Clipboard",
    contexts: ["image"],
  });
});

// Main context menu handler
browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "copy-image") {
    await handleImageCopy(info, tab);
  }
});

/**
 * Handles the image copy operation from context menu
 */
async function handleImageCopy(info, tab) {
  try {
    if (!info.srcUrl) {
      throw new Error("No image URL found");
    }
    if (!tab.url) {
      throw new Error("Cannot access page information");
    }

    const resolvedUrl = resolveImageUrl(info.srcUrl, tab.url);
    const imageBlob = await fetchImage(resolvedUrl);

    const { base64, blob: processedBlob } = await processImageBlob(imageBlob);

    const response = await sendCopyImageMessage(base64, processedBlob.type);

    handleNativeResponse(response, tab.id);
  } catch (error) {
    showNotification(tab.id, "Unable to copy image: " + error.message, true);
  }
}

browser.runtime.onMessage.addListener((request) => {
  if (request.greeting === "hello") {
    return Promise.resolve({ farewell: "goodbye" });
  }
});

