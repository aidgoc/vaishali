from setuptools import setup, find_packages

setup(
    name="vaishali",
    version="0.1.0",
    description="DSPL Org OS — AI-powered ERP assistant with View Engine",
    author="Harshwardhan Gokhale",
    author_email="harsh@dgoc.in",
    packages=find_packages(),
    zip_safe=False,
    include_package_data=True,
    install_requires=[
        "anthropic>=0.40.0",
    ],
)
