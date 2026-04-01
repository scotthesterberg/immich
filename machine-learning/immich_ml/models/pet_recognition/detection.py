from typing import Any
import numpy as np
from PIL import Image
from numpy.typing import NDArray

from immich_ml.models.base import InferenceModel
from immich_ml.models.transforms import decode_pil, resize_pil, to_numpy
from immich_ml.schemas import FaceDetectionOutput, ModelSession, ModelTask, ModelType

class PetDetector(InferenceModel):
    depends = []
    identity = (ModelType.DETECTION, ModelTask.PET_RECOGNITION)

    def _load(self) -> ModelSession:
        return self._make_session(self.model_path)

    def _predict(self, inputs: Image.Image | bytes, **kwargs: Any) -> FaceDetectionOutput:
        image = decode_pil(inputs)
        width, height = image.size
        
        input_size = 640
        image_resized = resize_pil(image, input_size)
        image_np = to_numpy(image_resized).transpose(2, 0, 1) # [3, 640, 640]
        image_np = image_np.astype(np.float32) / 255.0
        image_np = np.expand_dims(image_np, 0) # [1, 3, 640, 640]

        outputs = self.session.run(None, {self.session.get_inputs()[0].name: image_np})[0]
        
        output = outputs[0] # [84, 8400]
        
        boxes = []
        scores = []
        
        # YOLOv8 output: [cx, cy, w, h, class0, ..., class79]
        for i in range(8400):
            class_scores = output[4:, i]
            class_id = np.argmax(class_scores)
            score = class_scores[class_id]
            
            # COCO indices: 15 is cat, 16 is dog
            if score > 0.25 and class_id in [15, 16]:
                cx, cy, w, h = output[:4, i]
                x1 = (cx - w / 2) * width / input_size
                y1 = (cy - h / 2) * height / input_size
                x2 = (cx + w / 2) * width / input_size
                y2 = (cy + h / 2) * height / input_size
                
                boxes.append([x1, y1, x2, y2])
                scores.append(score)
        
        if not boxes:
            return {
                "boxes": np.zeros((0, 4), dtype=np.float32),
                "scores": np.zeros(0, dtype=np.float32),
                "landmarks": np.zeros((0, 0), dtype=np.float32),
            }

        return {
            "boxes": np.array(boxes, dtype=np.float32),
            "scores": np.array(scores, dtype=np.float32),
            "landmarks": np.zeros((len(boxes), 0), dtype=np.float32),
        }
