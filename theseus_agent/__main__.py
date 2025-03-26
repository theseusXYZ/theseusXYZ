import signal
import sys
import click
from theseus_agent.server import app
from theseus_agent.__version__ import __version__

@click.group(invoke_without_command=True)
@click.option('--version', is_flag=True, help="Show the version and exit.")
@click.pass_context
def cli(ctx, version):
    """theseus Agent CLI application."""
    if version:
        click.echo(f"{__version__}")
        ctx.exit()
    elif ctx.invoked_subcommand is None:
        click.echo(ctx.get_help())
    else:
        if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
            click.echo("running in a PyInstaller bundle")
        else:
            click.echo("running in a normal Python process")

@cli.command()
@click.option("--port", default=8000, help="Port number for the server.")
@click.option("--db_path", default=None, help="Path to the database.")
def server(port, db_path):
    """Start the theseus Agent server."""
    import uvicorn

    app.db_path = db_path

    def signal_handler(sig, frame):
        print("Received signal to terminate. Shutting down gracefully...")
        uvicorn_server.should_exit = True

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    config = uvicorn.Config(
        app,
        host="0.0.0.0",
        port=port,
        reload=True,
    )
    uvicorn_server = uvicorn.Server(config)

    uvicorn_server.run()

    # uvicorn.run(app, host="0.0.0.0", port=port)

cli.add_command(server)


def main():
    cli()


if __name__ == "__main__":
    main()
