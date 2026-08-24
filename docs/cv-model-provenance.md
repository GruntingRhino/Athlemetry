# Computer-Vision Model Provenance

## YoutuReID athlete appearance embedding

- Purpose: person appearance embeddings for athlete identity continuity and bounded long-occlusion recovery.
- Artifact: `person_reid_youtu_2021nov_int8.onnx`
- Runtime path: `/models/person_reid_youtu_2021nov_int8.onnx`
- Source repository: https://huggingface.co/opencv/person_reid_youtureid
- Direct artifact URL: https://huggingface.co/opencv/person_reid_youtureid/resolve/main/person_reid_youtu_2021nov_int8.onnx
- Upstream model source: https://github.com/ReID-Team/ReID_extra_testdata
- Upstream documentation: https://huggingface.co/opencv/person_reid_youtureid/blob/main/README.md
- License: Apache License 2.0; the upstream README states that all files in the model directory use this license.
- License text: https://huggingface.co/opencv/person_reid_youtureid/blob/main/LICENSE
- Size: 26,763,574 bytes.
- SHA-256: `4757c4cb759b79030a9870abf29c064c2ee51e079a05700690800c81b16cf245`
- Input: BGR person crop converted to RGB, resized to 128 x 256, scaled to `[0,1]`, then normalized by ImageNet mean `(0.485, 0.456, 0.406)` and standard deviation `(0.229, 0.224, 0.225)`.
- Output: 768-dimensional float embedding, L2-normalized by Athlemetry before matching.
- Backend: OpenCV DNN CPU.

The worker build downloads this exact artifact and verifies its SHA-256. The worker entrypoint verifies the checksum again and executes a real 768-dimensional embedding preflight before accepting work.

### Training-data rights boundary

The artifact license does not, by itself, prove commercial rights to every dataset used to train the model. The reported benchmark/training lineage includes pedestrian ReID datasets such as Market1501, DukeMTMC, and CUHK03 that are commonly distributed under research-use conditions. Consequently, YoutuReID is an engineering and controlled-validation baseline in Athlemetry, not an automatically approved commercial-production model.

Before professional commercial release, retain a written legal review approving the complete training-data/model chain or replace this artifact with an Athlemetry-trained model whose participant releases and dataset rights explicitly authorize the intended commercial use. The replacement must have a new immutable hash, analyzer/model version, capability report, and independent accuracy study.

## Evidence boundary

The upstream artifact license and successful inference establish the published distribution terms and software operation only; they do not independently settle inherited training-data rights or establish professional accuracy for Athlemetry footage. Identity release remains blocked until the legal boundary above is resolved and a permission-cleared Athlemetry benchmark measures IDF1, identity switches, ambiguity rejection, and post-occlusion recovery across supported sports, uniforms, devices, lighting, camera angles, bystanders, and occlusion durations.
