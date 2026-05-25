import os

import uvicorn
from fastapi import FastAPI

app = FastAPI(title="docker-cookbook python sample")


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "hello from python cookbook sample"}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run(
        "src.main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8000")),
        workers=int(os.getenv("WORKERS", "1")),
        log_level=os.getenv("LOG_LEVEL", "info").lower(),
    )
