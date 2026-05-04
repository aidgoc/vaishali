"""Pytest fixtures for payroll parser tests."""
import pytest
from vaishali.payroll.ingest import excel_path

@pytest.fixture
def dcepl_staff_xlsx():
    return excel_path("dcepl_staff")

@pytest.fixture
def dspl_staff_xlsx():
    return excel_path("dspl_staff")

@pytest.fixture
def dcepl_operator_xlsx():
    return excel_path("dcepl_operator")

@pytest.fixture
def overhead_xlsx():
    return excel_path("overhead")

@pytest.fixture
def leave_tracker_xlsx():
    return excel_path("leave_tracker")
