from typing import Any
import numpy as np
from PIL import Image
from numpy.typing import NDArray

from immich_ml.models.base import InferenceModel
from immich_ml.models.transforms import decode_pil, resize_pil, to_numpy, normalize, serialize_np_array
from immich_ml.schemas import ModelSession, ModelTask, ModelType

class PetRecognizer(InferenceModel):
    depends = [(ModelType.DETECTION, ModelTask.PET_RECOGNITION)]
    identity = (ModelType.RECOGNITION, ModelTask.PET_RECOGNITION)

    def __init__(self, model_name: str, **model_kwargs: Any) -> None:
        super().__init__(model_name, **model_kwargs)
        self.mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
        self.std = np.array([0.229, 0.224, 0.225], dtype=np.float32)

    def _load(self) -> ModelSession:
        return self._make_session(self.model_path)

    def _predict(self, inputs: Image.Image | bytes, detections: Any, **kwargs: Any) -> Any:
        image = decode_pil(inputs)
        
        results = []
        for i in range(len(detections["boxes"])):
            x1, y1, x2, y2 = detections["boxes"][i]
            score = detections["scores"][i]
            
            # Crop pet
            crop = image.crop((x1, y1, x2, y2))
            
            # Resize and normalize
            input_size = 384
            crop_resized = resize_pil(crop, input_size)
            crop_np = to_numpy(crop_resized) # [384, 384, 3]
            crop_np = crop_np.astype(np.float32) / 255.0
            crop_np = normalize(crop_np, self.mean, self.std).transpose(2, 0, 1) # [3, 384, 384]
            crop_np = np.expand_dims(crop_np, 0) # [1, 3, 384, 384]
            
            embedding = self.session.run(None, {self.session.get_inputs()[0].name: crop_np})[0][0]
            
            results.append({
                "boundingBox": {
                    "x1": int(x1),
                    "y1": int(y1),
                    "x2": int(x2),
                    "y2": int(y2),
                },
                "embedding": serialize_np_array(embedding),
                "score": float(score),
            })
            
        return results
