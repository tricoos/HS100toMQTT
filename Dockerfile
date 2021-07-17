FROM arm32v7/node:slim

WORKDIR /code

# Just replace the CMD line by the ENTRYPOINT line below, then go into the container and start the script manually for debugging
#ENTRYPOINT ["tail", "-f", "/dev/null"]
CMD ["./run.sh"]
