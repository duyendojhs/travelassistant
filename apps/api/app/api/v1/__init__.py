from fastapi import APIRouter

from app.api.v1.routes.account import router as account_router
from app.api.v1.routes.admin import events_router, router as admin_ops_router
from app.api.v1.routes.auth import router as auth_router
from app.api.v1.routes.content import admin_router, image_router, router as content_router
from app.api.v1.routes.dataops import router as dataops_router
from app.api.v1.routes.health import router as health_router
from app.api.v1.routes.chat import router as chat_router
from app.api.v1.routes.itineraries import router as itinerary_router, shared_router as shared_itinerary_router
from app.api.v1.routes.voice import router as voice_router

api_router = APIRouter()
api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_router.include_router(account_router, prefix="/account", tags=["account"])
api_router.include_router(health_router, prefix="/health", tags=["health"])
api_router.include_router(content_router)
api_router.include_router(admin_router)
api_router.include_router(admin_ops_router)
api_router.include_router(events_router)
api_router.include_router(image_router)
api_router.include_router(dataops_router)
api_router.include_router(chat_router)
api_router.include_router(itinerary_router)
api_router.include_router(shared_itinerary_router)
api_router.include_router(voice_router)
