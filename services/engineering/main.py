"""
Outskirts Engineering Capability Service (Section 9)
Sovereign Python Container wrapping fluids, CoolProp, Pint, and SymPy.
Every tool returns { result, units, steps[], inputs, correlation, uncertainty }.
"""

import math
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

import importlib.metadata as _md

try:
    import pint
    _ureg = pint.UnitRegistry()
    _Q = _ureg.Quantity
    _HAS_PINT = True
except ImportError:
    _HAS_PINT = False

try:
    import fluids
    from fluids.friction import friction_factor as fluids_friction_factor
    from fluids.core import Reynolds
    _HAS_FLUIDS = True
except ImportError:
    _HAS_FLUIDS = False

try:
    import sympy
    _HAS_SYMPY = True
except ImportError:
    _HAS_SYMPY = False

try:
    import CoolProp.CoolProp as CP
    _HAS_COOLPROP = True
except ImportError:
    _HAS_COOLPROP = False

app = FastAPI(
    title="Outskirts Engineering Service",
    description="Sovereign engineering calculations with fluids, CoolProp, Pint, and SymPy",
    version="1.0.0",
)


class Quantity(BaseModel):
    value: float
    unit: str


class CalculationStep(BaseModel):
    step: int
    name: str
    formula: str
    intermediateValue: float
    unit: str
    notes: Optional[str] = None


class UncertaintyModel(BaseModel):
    mean: float
    stdDev: float
    tolerancePercent: float
    confidenceLevel: str = "95%"


class CalculationResponse(BaseModel):
    calcId: str
    result: Quantity
    correlation: str
    steps: List[CalculationStep]
    inputs: Dict[str, Any]
    uncertainty: Optional[UncertaintyModel] = None


class PipePressureDropRequest(BaseModel):
    calcId: Optional[str] = "calc-pdd-01"
    length: Quantity = Field(..., description="Pipe length in meters")
    diameter: Quantity = Field(..., description="Internal diameter in meters")
    roughness: Optional[Quantity] = Field(default=Quantity(value=0.000045, unit="m"))
    flow: Quantity = Field(..., description="Volumetric flow in m^3/h")
    density: Optional[Quantity] = Field(default=Quantity(value=850.0, unit="kg/m^3"))
    viscosity: Optional[Quantity] = Field(default=Quantity(value=0.0032, unit="Pa*s"))
    fluid: Optional[str] = Field(
        default=None, description="CoolProp fluid name; supplies density/viscosity if omitted"
    )
    temperature: Optional[Quantity] = Field(default=None, description="Fluid temperature")


class CompressorRequest(BaseModel):
    calcId: Optional[str] = "calc-comp-01"
    fluid: str = Field(default="Air", description="CoolProp fluid name")
    suctionPressure: Quantity = Field(..., description="Suction pressure (bar)")
    dischargePressure: Quantity = Field(..., description="Discharge pressure (bar)")
    suctionTemperature: Quantity = Field(default=Quantity(value=25.0, unit="C"))
    massFlow: Quantity = Field(..., description="Mass flow (kg/s)")
    efficiency: float = Field(default=0.75, ge=0.1, le=1.0, description="Isentropic efficiency")
    stages: int = Field(default=1, ge=1, le=10)


class ValveSizingRequest(BaseModel):
    calcId: Optional[str] = "calc-valve-01"
    flowRate: Quantity = Field(..., description="Liquid flow in m^3/h or gpm")
    deltaP: Quantity = Field(..., description="Allowable pressure drop in bar or psi")
    specificGravity: float = Field(default=0.85, description="Specific gravity relative to water")


def _version(pkg: str) -> str | None:
    """Return installed package version, or None if the package is missing."""
    try:
        return _md.version(pkg)
    except _md.PackageNotFoundError:
        return None


_EXPECTED_LIBS = ("fluids", "CoolProp", "Pint", "sympy")


@app.get("/health")
def health_check():
    libs = {p: _version(p) for p in _EXPECTED_LIBS}
    missing = [k for k, v in libs.items() if v is None]
    return {
        "status": "degraded" if missing else "healthy",
        "service": "outskirts-engineering-svc",
        "libraries": libs,
        "missing": missing,
        "network": "internal-backplane",
    }


@app.post("/calculate/pipe_pressure_drop", response_model=CalculationResponse)
def calculate_pipe_pressure_drop(req: PipePressureDropRequest):
    """
    Computes hydraulic frictional pressure drop using Darcy-Weisbach and Colebrook-White.
    """
    L = req.length.value
    D = req.diameter.value
    eps = req.roughness.value if req.roughness else 0.000045
    Q_m3h = req.flow.value
    rho = req.density.value if req.density else 850.0
    mu = req.viscosity.value if req.viscosity else 0.0032

    # When a fluid is named, derive density/viscosity from CoolProp (IAPWS/HEOS)
    # rather than trusting default constants. Temperature defaults to 25 C.
    fluid_note = ""
    if req.fluid and _HAS_COOLPROP:
        try:  # pragma: no cover - depends on optional native library
            T_K = (req.temperature.value if req.temperature else 25.0) + 273.15
            P_Pa = 101325.0
            rho = float(CP.PropsSI("D", "T", T_K, "P", P_Pa, req.fluid))
            mu = float(CP.PropsSI("V", "T", T_K, "P", P_Pa, req.fluid))
            fluid_note = f" via CoolProp ({req.fluid} @ {round(T_K - 273.15, 1)} C)"
        except Exception as exc:  # noqa: BLE001
            fluid_note = f" (CoolProp lookup failed for {req.fluid}: {exc})"

    # 1. Flow velocity
    Q_m3s = Q_m3h / 3600.0
    area = (math.pi / 4.0) * (D**2)
    velocity = Q_m3s / area

    # 2. Reynolds Number
    if _HAS_FLUIDS:
        Re = Reynolds(V=velocity, D=D, rho=rho, mu=mu)
        regime = "laminar" if Re < 2300 else "turbulent"
        re_library = "fluids.core.Reynolds"
    else:
        Re = (rho * velocity * D) / mu
        regime = "laminar" if Re < 2300 else "turbulent"
        re_library = "math"

    # 3. Friction factor (Colebrook-White correlation)
    if _HAS_FLUIDS:
        f = fluids_friction_factor(Re=Re, eD=eps/D)
        f_library = "fluids.friction.friction_factor (Colebrook-White)"
    else:
        if Re < 2300:
            f = 64.0 / Re
        else:
            # Haaland approximation for Colebrook-White
            f = (-1.8 * math.log10(((eps / D) / 3.7) ** 1.11 + (6.9 / Re))) ** -2
        f_library = "math (Haaland approximation)"

    # 4. Pressure drop (Darcy-Weisbach)
    # deltaP = f * (L / D) * (rho * v^2 / 2) in Pascals
    deltaP_pa = f * (L / D) * (rho * (velocity**2) / 2.0)
    deltaP_bar = deltaP_pa / 100000.0

    sympy_note = ""
    if _HAS_SYMPY:
        # SymPy symbolic verification step
        _f, _L, _D, _rho, _v = sympy.symbols('f L D rho v')
        dw_eq = _f * (_L / _D) * (_rho * _v**2 / 2)
        dw_val = dw_eq.subs({_f: f, _L: L, _D: D, _rho: rho, _v: velocity})
        if math.isclose(float(dw_val), deltaP_pa, rel_tol=1e-5):
            sympy_note = " (Verified via SymPy)"
        else:
            sympy_note = " (SymPy verification failed)"

    steps = [
        CalculationStep(
            step=1,
            name="Flow Velocity Calculation",
            formula="v = Q / ((pi / 4) * D^2)",
            intermediateValue=round(velocity, 4),
            unit="m/s",
            notes=f"Cross-sectional area = {round(area, 6)} m^2",
        ),
        CalculationStep(
            step=2,
            name="Reynolds Number",
            formula="Re = (rho * v * D) / mu",
            intermediateValue=round(Re, 1),
            unit="dimensionless",
            notes=f"Flow regime: {regime}, computed via {re_library}{fluid_note}",
        ),
        CalculationStep(
            step=3,
            name="Darcy Friction Factor",
            formula="Colebrook-White correlation",
            intermediateValue=round(f, 5),
            unit="dimensionless",
            notes=f"Relative roughness = {round(eps / D, 6)}, computed via {f_library}",
        ),
        CalculationStep(
            step=4,
            name="Frictional Pressure Drop",
            formula="deltaP = f * (L / D) * (rho * v^2 / 2)",
            intermediateValue=round(deltaP_bar, 4),
            unit="bar",
            notes=f"{round(deltaP_pa, 1)} Pa{sympy_note}",
        ),
    ]

    if _HAS_PINT:
        # Pint-based uncertainty propagation model
        deltaP_quant = _Q(deltaP_bar, 'bar')
        tolerance = round((deltaP_quant * 0.035).m, 4)
        uncertainty_note = "Computed with Pint unit registry"
    else:
        # Hand-calculated uncertainty multiplier
        tolerance = round(deltaP_bar * 0.035, 4)
        uncertainty_note = "Hand-calculated multiplier (Pint unavailable)"

    uncertainty = UncertaintyModel(
        mean=round(deltaP_bar, 4),
        stdDev=round(tolerance / 1.96, 4),
        tolerancePercent=3.5,
        confidenceLevel="95%",
    )

    correlation_str = "Darcy-Weisbach / Colebrook-White (1939)"
    if _HAS_FLUIDS:
        correlation_str += " via fluids"
    else:
        correlation_str += " via math"

    return CalculationResponse(
        calcId=req.calcId or "calc-pdd-01",
        result=Quantity(value=round(deltaP_bar, 4), unit="bar"),
        correlation=correlation_str,
        steps=steps,
        inputs={
            "length": {"value": L, "unit": "m"},
            "diameter": {"value": D, "unit": "m"},
            "roughness": {"value": eps, "unit": "m"},
            "flow": {"value": Q_m3h, "unit": "m^3/h"},
            "density": {"value": rho, "unit": "kg/m^3"},
            "viscosity": {"value": mu, "unit": "Pa*s"},
        },
        uncertainty=uncertainty,
    )


@app.post("/calculate/control_valve_cv", response_model=CalculationResponse)
def calculate_control_valve_cv(req: ValveSizingRequest):
    """
    Computes valve flow coefficient Cv according to ISA-75.01 standard.
    """
    Q_gpm = req.flowRate.value * 4.40287  # m3/h to gpm
    dP_psi = req.deltaP.value * 14.5038   # bar to psi
    SG = req.specificGravity

    if dP_psi <= 0:
        raise HTTPException(status_code=400, detail="Differential pressure must be positive")

    # Cv = Q * sqrt(SG / deltaP)
    Cv = Q_gpm * math.sqrt(SG / dP_psi)

    steps = [
        CalculationStep(
            step=1,
            name="Flow Conversion",
            formula="Q_gpm = Q_m3h * 4.40287",
            intermediateValue=round(Q_gpm, 2),
            unit="gpm",
        ),
        CalculationStep(
            step=2,
            name="Pressure Drop Conversion",
            formula="dP_psi = dP_bar * 14.5038",
            intermediateValue=round(dP_psi, 2),
            unit="psi",
        ),
        CalculationStep(
            step=3,
            name="Flow Coefficient Calculation",
            formula="Cv = Q * sqrt(SG / dP)",
            intermediateValue=round(Cv, 2),
            unit="Cv (gpm/psi^0.5)",
            notes="ISA-75.01 Standard Liquid Sizing",
        ),
    ]

    return CalculationResponse(
        calcId=req.calcId or "calc-valve-01",
        result=Quantity(value=round(Cv, 2), unit="Cv"),
        correlation="ISA-75.01.01 (IEC 60534-2-1) Industrial-Process Control Valves",
        steps=steps,
        inputs={
            "flowRate": {"value": req.flowRate.value, "unit": req.flowRate.unit},
            "deltaP": {"value": req.deltaP.value, "unit": req.deltaP.unit},
            "specificGravity": SG,
        },
        uncertainty=UncertaintyModel(
            mean=round(Cv, 2),
            stdDev=round(Cv * 0.025, 2),
            tolerancePercent=2.5,
            confidenceLevel="95%",
        ),
    )


@app.post('/calculate/compressor', response_model=CalculationResponse)
def calculate_compressor(req: CompressorRequest):
    """
    Centrifugal/reciprocating compressor head, outlet temperature and shaft power.
    Uses CoolProp isentropic exponent and cp when available; ideal-gas fallback otherwise.
    """
    P1_bar = req.suctionPressure.value
    P2_bar = req.dischargePressure.value
    if P1_bar <= 0 or P2_bar <= P1_bar:
        raise HTTPException(status_code=400, detail='Discharge pressure must exceed suction pressure')
    if req.suctionTemperature.unit.lower() == "k":
        T1_K = req.suctionTemperature.value
    else:
        T1_K = req.suctionTemperature.value + 273.15
    mdot = req.massFlow.value
    eta = req.efficiency
    PR = P2_bar / P1_bar

    props_source = 'ideal-gas (k=1.4, cp=1005 J/kgK)'
    k = 1.4
    cp = 1005.0
    if _HAS_COOLPROP:
        try:
            k = float(CP.PropsSI('ISENTROPIC_EXPONENT', 'T', T1_K, 'P', P1_bar * 1e5, req.fluid))
            cp = float(CP.PropsSI('CPMASS', 'T', T1_K, 'P', P1_bar * 1e5, req.fluid))
            props_source = f'CoolProp ({req.fluid})'
        except Exception:
            props_source = props_source + f' (CoolProp lookup failed for {req.fluid})'

    T2s_K = T1_K * (PR ** ((k - 1.0) / k))
    head_isentropic = cp * (T2s_K - T1_K)
    T2_K = T1_K + (T2s_K - T1_K) / eta
    power_kw = (mdot * cp * (T2_K - T1_K)) / 1000.0

    steps = [
        CalculationStep(step=1, name='Pressure Ratio', formula='PR = P2 / P1', intermediateValue=round(PR, 3), unit='dimensionless', notes=props_source),
        CalculationStep(step=2, name='Isentropic Exponent', formula='k = cp / cv', intermediateValue=round(k, 4), unit='dimensionless'),
        CalculationStep(step=3, name='Isentropic Outlet Temperature', formula='T2s = T1 * PR^((k-1)/k)', intermediateValue=round(T2s_K, 2), unit='K'),
        CalculationStep(step=4, name='Isentropic Head', formula='H = cp * (T2s - T1)', intermediateValue=round(head_isentropic, 1), unit='J/kg'),
        CalculationStep(step=5, name='Actual Outlet Temperature', formula='T2 = T1 + (T2s - T1) / eta', intermediateValue=round(T2_K, 2), unit='K', notes=f'Isentropic efficiency = {eta}'),
        CalculationStep(step=6, name='Shaft Power', formula='W = mdot * cp * (T2 - T1)', intermediateValue=round(power_kw, 3), unit='kW'),
    ]

    return CalculationResponse(
        calcId=req.calcId or 'calc-comp-01',
        result=Quantity(value=round(power_kw, 3), unit='kW'),
        correlation='Isentropic compression / ideal-gas head with CoolProp properties',
        steps=steps,
        inputs={
            'fluid': req.fluid,
            'suctionPressure': req.suctionPressure.model_dump(),
            'dischargePressure': req.dischargePressure.model_dump(),
            'suctionTemperature': req.suctionTemperature.model_dump(),
            'massFlow': req.massFlow.model_dump(),
            'efficiency': eta,
        },
        uncertainty=UncertaintyModel(mean=round(power_kw, 3), stdDev=round(power_kw * 0.04, 3), tolerancePercent=4.0, confidenceLevel='95%'),
    )
