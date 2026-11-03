from pydantic import BaseModel, ConfigDict


class Inbound(BaseModel):
    """Every request body. Unknown fields are rejected.

    Integer fields must also be declared strict (`Field(strict=True)`), so "2", 2.0 and
    true are not accepted as 2. Model-wide strict mode can't be used: FastAPI validates the
    parsed JSON in Python mode, where strict rejects UUID strings.
    """

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Outbound(BaseModel):
    model_config = ConfigDict(frozen=True)
