
let preview = document.getElementById("preview");
let recording = document.getElementById("recording");
let startButton = document.getElementById("startButton");
let stopButton = document.getElementById("stopButton");
let downloadButton = document.getElementById("downloadButton");
let logElement = document.getElementById("log");
let loginButton = document.getElementById("login");

let recorder;
const previewContainer = document.getElementById("previewContainer");
const canvas = document.getElementById("previewCanvas");
previewContainer.appendChild(canvas);

function setCanvasSize() {
  canvas.width = previewContainer.offsetWidth;
  canvas.height = previewContainer.offsetHeight;
}
setCanvasSize();
window.addEventListener("resize", setCanvasSize);
function log(msg) {
  logElement.innerHTML = msg + "\n";
}
function startRecording(stream) {
  recorder = new MediaRecorder(stream);
  let data = [];
  recorder.ondataavailable = (event) => data.push(event.data);
  recorder.start();

  log('"Recording..."');

  let stopped = new Promise((resolve, reject) => {
    recorder.onstop = resolve;
    recorder.onerror = (event) => reject(event.name);
  });

  return Promise.all([stopped, recorder]).then(() => data);
}

function stop(stream) {
  if (recorder.state == "recording") {
    recorder.stop();
  }
  stream.getTracks().forEach((track) => track.stop());
  preview.srcObject = null;
}

function startSharing() {
  navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: false,
  })
    .then((stream) => {
      preview.captureStream = preview.captureStream || preview.mozCaptureStream;
      preview.srcObject = stream;
      return new Promise((resolve) => (preview.onplaying = resolve));

    }).then(() => {
      startWebcam();
    }).then(() => startRecording(preview.captureStream()))
    .then((recordedChunks) => {
      let recordedBlob = new Blob(recordedChunks, { type: "video/webm" });
      recording.src = URL.createObjectURL(recordedBlob);
      downloadButton.href = recording.src;
      downloadButton.download = "RecordedVideo.webm";
      log(
        "Successfully recorded " +
        recordedBlob.size +
        " bytes of " +
        recordedBlob.type +
        " media."
      );
    })
    .catch(log);
}

Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri('https://cdn.jsdelivr.net/gh/asif771/Recognized_face_and_record/models/'),
  faceapi.nets.ssdMobilenetv1.loadFromUri("https://cdn.jsdelivr.net/gh/asif771/Recognized_face_and_record/models/"),
  faceapi.nets.faceLandmark68Net.loadFromUri("https://cdn.jsdelivr.net/gh/asif771/Recognized_face_and_record/models/"),
  faceapi.nets.faceRecognitionNet.loadFromUri('https://cdn.jsdelivr.net/gh/asif771/Recognized_face_and_record/models/'),
  faceapi.nets.faceExpressionNet.loadFromUri('https://cdn.jsdelivr.net/gh/asif771/Recognized_face_and_record/models/')
]);


async function startWebcam() {
  const constraints = {
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
      facingMode: "user"
    },
    audio: false
  };
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    preview.srcObject = stream;
    setInterval(async () => {
      const brightnessMessage = await detectLiveLightAndUpdateQuality(canvas.width, canvas.height);
      displayQualityMessage(brightnessMessage);
    }, 5000);
    const qualityMessage = checkVideoQuality();
    displayQualityMessage(qualityMessage);
    setInterval(() => {
      const qualityMessage = checkVideoQuality();
      displayQualityMessage(qualityMessage);
    }, 5000);
    startFaceRecognition();
  } catch (error) {
    console.error('Error accessing webcam:', error);
  }
}


function getLabeledFaceDescriptions() {
  const labels = ["asif", "tanvir", "waqas"];
  return Promise.all(
    labels.map(async (label) => {
      const descriptions = [];
      for (let i = 1; i <= 2; i++) {
        const img = await faceapi.fetchImage(`https://github.com/asif771/Recognized_face_and_record/tree/main/labels/${label}/${i}.jpg`);
        const detections = await faceapi
          .detectSingleFace(img)
          .withFaceLandmarks()
          .withFaceDescriptor();
        descriptions.push(detections.descriptor);
      }
      return new faceapi.LabeledFaceDescriptors(label, descriptions);
    })
  );
}




stopButton.addEventListener(
  "click",
  function () {
    stop(preview.srcObject);
  });





startButton.addEventListener("click", async function () {
  await startSharing();
  // performLivenessDetection();
  // performDynamicChallenge();
});

let recognitionInterval;
let wasStoppedDueToQuality = false;
async function startFaceRecognition() {

  const labeledFaceDescriptors = await getLabeledFaceDescriptions();
  const faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors);

  const displaySize = { width: preview.width, height: preview.height };
  faceapi.matchDimensions(canvas, displaySize);

  recognitionInterval = setInterval(async () => {
    const qualityMessage = checkVideoQuality();
    const brightnessMessage = await detectLiveLightAndUpdateQuality(canvas.width, canvas.height);

    if (qualityMessage.includes('not optimal') || brightnessMessage === 'dark') {
      clearInterval(recognitionInterval);
      wasStoppedDueToQuality = true;
      const resumeRecognition = confirm("Face recognition stopped: " + (brightnessMessage === 'dark' ? "Insufficient brightness" : "Resolution not optimal") + ". Do you want to resume?");
      if (resumeRecognition) {
        startFaceRecognition();
      } else {
        alert("Face recognition stopped. Please ensure optimal conditions and restart.");
      }
      return;
    }
    const detections = await faceapi.detectAllFaces(preview, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptors();
    const resizedDetections = faceapi.resizeResults(detections, displaySize);

    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);

    faceapi.draw.drawDetections(canvas, resizedDetections)
    faceapi.draw.drawFaceLandmarks(canvas, resizedDetections)

    const results = resizedDetections.map((d) => {
      return faceMatcher.findBestMatch(d.descriptor);
    });
    results.forEach((result, i) => {
      const box = resizedDetections[i].detection.box;
      const drawBox = new faceapi.draw.DrawBox(box, {
        label: result,
      });
      drawBox.draw(canvas);
    });
  }, 100);
}

// function displayMessage(message) {
//   const messageContainer = document.getElementById('messageContainer');
//   messageContainer.textContent = message;

//   if (message) {
//     // Show a confirmation dialog if message is not empty
//     if (confirm(message)) {
//       startFaceRecognition(); // Resume face recognition if user confirms
//     }
//   }
// }
function checkVideoQuality() {
  if (preview.srcObject) {
    const videoTrack = preview.srcObject.getVideoTracks()[0];
    const settings = videoTrack.getSettings();

    const resolution = `${settings.width}x${settings.height}`;
    const frameRate = settings.frameRate;
    let qualityMessage = '';
    const resolutionThreshold = '1280x720';
    const frameRateThreshold = 30;

    if (resolution >= resolutionThreshold) {
      qualityMessage += 'Resolution is optimal. ';
    } else {
      qualityMessage += 'Resolution is not optimal. ';
    }

    if (frameRate >= frameRateThreshold) {
      qualityMessage += 'Frame rate is optimal.';
    } else {
      qualityMessage += 'Frame rate is not optimal.';
    }
    return qualityMessage;
  }
  else{
    console.log('preview is empty')
  }
}

function displayQualityMessage(message) {
  const qualityMessageElement = document.getElementById('qualityMessage');
  if (qualityMessageElement) {
    qualityMessageElement.textContent = message;
  } else {
    console.error('Quality message element not found.');
  }
}
async function detectLiveLightAndUpdateQuality(width, height) {
  const context = canvas.getContext("2d");
  context.drawImage(preview, 0, 0, width, height);

  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;

  let totalBrightness = 0;

  // Iterate through each pixel and calculate the brightness
  for (let i = 0; i < data.length; i += 4) {
    // Extract RGB values
    const red = data[i];
    const green = data[i + 1];
    const blue = data[i + 2];

    // Calculate brightness using the relative luminance formula
    // Y = 0.2126 * R + 0.7152 * G + 0.0722 * B
    const brightness = 0.2126 * red + 0.7152 * green + 0.0722 * blue;

    totalBrightness += brightness;
  }

  // Calculate the average brightness over all pixels
  const averageBrightness = totalBrightness / (width * height);
  console.log(averageBrightness, "average brightness");

  const darknessThreshold = 100; // Adjust this value according to your needs

  if (averageBrightness < darknessThreshold) {
    return 'dark';
  } else {
    return 'bright';
  }
}

// Liveness Detection function
// async function performLivenessDetection() {
//   // Detect facial landmarks and expressions
//   const detections = await faceapi.detectAllFaces(preview, new faceapi.TinyFaceDetectorOptions())
//     .withFaceLandmarks()
//     .withFaceExpressions();

//   detections.forEach((detection) => {
//     const landmarks = detection.landmarks._positions;
//     const expressions = detection.expressions;

//     // Example: Detect a blink by comparing the vertical position of the eyes
//     const eyeLandmarks = landmarks.filter((landmark) => landmark.part.includes("eye"));
//     const eyeAspectRatio = calculateEyeAspectRatio(eyeLandmarks);
//     if (eyeAspectRatio < 0.2) {
//       log("Blink detected. Liveness verified.");
//       isLivenessVerified = true;
//     }

//     // Example: Detect a smile as an indication of liveness
//     if (expressions.happy > 0.5) {
//       log("Smile detected. Liveness verified.");
//       isLivenessVerified = true;
//     }
//   });
// }

// // Dynamic Challenge function
// async function performDynamicChallenge() {
//   // Perform object detection to track a moving object
//   const detections = await faceapi.detectAllFaces(preview, new faceapi.TinyFaceDetectorOptions());

//   detections.forEach((detection) => {
//     const box = detection.box;

//     // Example: Track the movement of a moving object within the bounding box
//     const movingObject = document.getElementById("movingObject");
//     movingObject.style.left = box.x + "px";
//     movingObject.style.top = box.y + "px";
//     movingObject.style.display = "block";

//     movingObject.addEventListener("mouseover", () => {
//       log("Following the moving object. Challenge completed.");
//       isChallengeCompleted = true;
//     });
//   });
// }

// preview.addEventListener("play", async () => {
//   const labeledFaceDescriptors = await getLabeledFaceDescriptions();
//   const faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors);
//   const displaySize = { width: preview.width, height: preview.height };
//   faceapi.matchDimensions(canvas, displaySize);

//   setInterval(async () => {
//     const detections = await faceapi.detectAllFaces(preview, new faceapi.TinyFaceDetectorOptions())
//       .withFaceLandmarks()
//       .withFaceDescriptors()
//       .withFaceExpressions();
//     const resizedDetections = faceapi.resizeResults(detections, displaySize);

//     canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);

//     const results = resizedDetections.map((d) => {
//       return faceMatcher.findBestMatch(d.descriptor);
//     });

//     results.forEach((result, i) => {
//       const detection = resizedDetections[i];
//       const box = detection.detection.box;
//       const landmarks = detection.landmarks;
//       const drawLandmarks = new faceapi.draw.DrawFaceLandmarks(landmarks);
//       drawLandmarks.draw(canvas);
//       const drawBox = new faceapi.draw.DrawBox(box, {
//         label: `${result.label}`,
//       });
//       drawBox.draw(canvas);
//     });
//   }, 100);
//   console.log("face recognization completed")
// });