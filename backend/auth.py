import os
from datetime import datetime, timedelta, timezone
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from database import get_db
from models import Negocio

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "trainapp-super-secret-production-key-2026")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 30

security = HTTPBearer(auto_error=False)


def create_access_token(negocio_id: int, telefono: str) -> str:
    """
    Crea un JWT persistente por 30 días para guardar en el localStorage del celular del entrenador.
    """
    expire = datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": str(negocio_id),
        "telefono": telefono,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_current_negocio(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> Negocio:
    """
    Middleware / Dependency que protege las rutas de /admin y garantiza el aislamiento Multi-Tenant.
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No autenticado. Ingresa tu celular y PIN de 4 dígitos.",
        )

    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        negocio_id_str = payload.get("sub")
        if not negocio_id_str:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido.")
        negocio_id = int(negocio_id_str)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tu sesión de 30 días ha expirado. Vuelve a ingresar tu PIN.",
        )
    except (jwt.PyJWTError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas. Vuelve a iniciar sesión.",
        )

    negocio = db.query(Negocio).filter(Negocio.id == negocio_id).first()
    if not negocio:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="El gimnasio o club asociado a esta sesión no existe.",
        )
    return negocio
