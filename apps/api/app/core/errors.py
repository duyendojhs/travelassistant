from collections.abc import Sequence
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette import status


class ErrorResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    error: str
    message: str
    details: Sequence[Any] | None = None


def _error_response(
    status_code: int,
    error: str,
    message: str,
    details: Sequence[Any] | None = None,
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content=ErrorResponse(error=error, message=message, details=details).model_dump(),
    )


def configure_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(
        request: Request,
        exc: StarletteHTTPException,
    ) -> JSONResponse:
        message = exc.detail if isinstance(exc.detail, str) else "Request failed"
        return _error_response(
            status_code=exc.status_code,
            error="http_error",
            message=message,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        return _error_response(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            error="validation_error",
            message="Request validation failed",
            details=exc.errors(),
        )
