"""Import model modules so SQLAlchemy metadata is fully registered."""

from app.db.models import audit  # noqa: F401
from app.db.models import beta  # noqa: F401
from app.db.models import chat  # noqa: F401
from app.db.models import identity  # noqa: F401
from app.db.models import moderation  # noqa: F401
from app.db.models import story  # noqa: F401
from app.db.models import twin  # noqa: F401
