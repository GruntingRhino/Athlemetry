FROM node:26-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The builder prerenders NextAuth pages and therefore needs build-time
# configuration. These are placeholders only; runtime credentials are supplied
# by the deployment environment and are not copied into the final images.
ENV DATABASE_URL=postgresql://ci:ci@127.0.0.1:5432/athlemetry?schema=public \
    DIRECT_URL=postgresql://ci:ci@127.0.0.1:5432/athlemetry?schema=public \
    NEXTAUTH_URL=http://localhost:3000 \
    NEXTAUTH_SECRET=ci-only-build-secret-not-for-runtime
RUN npx prisma generate && npm run build

FROM base AS web
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# Next.js output tracing omits Sharp's dynamically loaded libvips shared object.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@img ./node_modules/@img
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.js"]

FROM base AS worker
ENV NODE_ENV=production \
    VISION_PYTHON=/opt/venv/bin/python \
    VISION_PERSON_MODEL=/models/yolov8n.pt \
    VISION_POSE_MODEL=/models/yolov8n-pose.pt \
    VISION_OBJECT_MODEL=/models/yolov8s-worldv2.pt \
    VISION_REID_MODEL=/models/person_reid_youtu_2021nov_int8.onnx \
    HOME=/models \
    PYTHONUNBUFFERED=1
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv git curl libgl1 libglib2.0-0 \
    && python3 -m venv /opt/venv \
    && rm -rf /var/lib/apt/lists/*
COPY vision_core/requirements.txt /tmp/vision-requirements.txt
RUN /opt/venv/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/venv/bin/pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch==2.13.0+cpu torchvision==0.28.0+cpu \
    && /opt/venv/bin/pip install --no-cache-dir -r /tmp/vision-requirements.txt \
    && /opt/venv/bin/pip uninstall -y opencv-python opencv-python-headless \
    && /opt/venv/bin/pip install --no-cache-dir --force-reinstall --no-deps opencv-contrib-python-headless==4.11.0.86 \
    && mkdir -p /models \
    && /opt/venv/bin/python -c "import os; os.chdir('/tmp'); from ultralytics import YOLO, YOLOWorld; YOLO('yolov8n.pt'); YOLO('yolov8n-pose.pt'); world=YOLOWorld('yolov8s-worldv2.pt'); world.set_classes(['sports ball','baseball bat','basketball hoop','soccer goal','home plate','sports cone','sports target'])" \
    && mv /tmp/yolov8n.pt /tmp/yolov8n-pose.pt /tmp/yolov8s-worldv2.pt /models/ \
    && curl -fsSL --retry 3 https://huggingface.co/opencv/person_reid_youtureid/resolve/main/person_reid_youtu_2021nov_int8.onnx -o /models/person_reid_youtu_2021nov_int8.onnx \
    && printf '%s  %s\n' '4757c4cb759b79030a9870abf29c064c2ee51e079a05700690800c81b16cf245' '/models/person_reid_youtu_2021nov_int8.onnx' | sha256sum -c - \
    && /opt/venv/bin/python -c "import cv2; assert hasattr(cv2, 'aruco')"
ENV VISION_PERSON_MODEL_SHA256=f59b3d833e2ff32e194b5bb8e08d211dc7c5bdf144b90d2c8412c47ccfc83b36 \
    VISION_POSE_MODEL_SHA256=c6fa93dd1ee4a2c18c900a45c1d864a1c6f7aba75d84f91648a30b7fb641d212 \
    VISION_OBJECT_MODEL_SHA256=9b2c17ab6124a913e9b3a5c170617920d91b0f01111a8479da69f00e2cf27792 \
    VISION_REID_MODEL_SHA256=4757c4cb759b79030a9870abf29c064c2ee51e079a05700690800c81b16cf245 \
    YOLO_CONFIG_DIR=/models/.config/Ultralytics
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src ./src
COPY --from=builder /app/vision_core ./vision_core
RUN groupadd --system --gid 1001 worker \
    && useradd --system --uid 1001 --gid worker worker \
    && rm -rf /tmp/Ultralytics \
    && mkdir -p /models/.config/Ultralytics /app/uploads \
    && chmod 0555 /app/scripts/worker-entrypoint.sh \
    && chown -R worker:worker /app /models
USER worker
HEALTHCHECK --interval=60s --timeout=5s --start-period=10s --retries=3 \
  CMD ["/app/scripts/worker-entrypoint.sh", "--check"]
CMD ["/app/scripts/worker-entrypoint.sh"]
