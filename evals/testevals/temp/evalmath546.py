from subprocess import run, PIPE

def test_add_valid_integers():
    """
    Verify that the application can add two valid integers.
    """
    result = run(["python", "evalmath.py", "add", "5", "3"], stdout=PIPE, stderr=PIPE, universal_newlines=True)
    assert result.returncode == 0
    assert result.stdout.strip() == "Result: 8"

def test_multiply_valid_integers():
    """
    Verify that the application can multiply two valid integers.
    """
    result = run(["python", "evalmath.py", "multiply", "4", "6"], stdout=PIPE, stderr=PIPE, universal_newlines=True)
    assert result.returncode == 0
    assert result.stdout.strip() == "Result: 24"

def test_invalid_operation():
    """
    Verify that the application handles an invalid operation gracefully.
    """
    result = run(["python", "evalmath.py", "subtract", "2", "3"], stdout=PIPE, stderr=PIPE, universal_newlines=True)
    assert result.returncode != 0
    assert "Invalid operation. Please use 'add' or 'multiply'." in result.stderr

def test_non_integer_arguments():
    """
    Verify that the application handles non-integer arguments gracefully.
    """
    result = run(["python", "evalmath.py", "add", "2.5", "3"], stdout=PIPE, stderr=PIPE, universal_newlines=True)
    assert result.returncode != 0
    assert "Invalid argument. Please provide integers." in result.stderr

def test_missing_arguments():
    """
    Verify that the application handles missing arguments gracefully.
    """
    result = run(["python", "evalmath.py", "add"], stdout=PIPE, stderr=PIPE, universal_newlines=True)
    assert result.returncode != 0
    assert "Missing arguments. Please provide operation, first number, and second number." in result.stderr

def test_multiply_by_zero():
    """
    Verify that the application handles zero as the second argument for multiplication.
    """
    result = run(["python", "evalmath.py", "multiply", "5", "0"], stdout=PIPE, stderr=PIPE, universal_newlines=True)
    assert result.returncode == 0
