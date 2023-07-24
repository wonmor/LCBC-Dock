# FOR BACK-END DEPLOYMENT... (FLASK)
FROM python:3.10.4-slim
WORKDIR /
WORKDIR /workdir
COPY api ./api
WORKDIR /workdir/api
RUN pip3 install -r ./requirements.txt

# FOR FRONT-END DEPLOYMENT... (REACT)
FROM node:16-alpine as build-step
# Don't forget "--from"! It acts as a bridge that connects two seperate stages
COPY --from=build-step workdir ./workdir
WORKDIR /workdir
ENV PATH /workdir/app/node_modules/.bin:$PATH
COPY app ./app
WORKDIR /workdir/app
RUN npm install
RUN npm run fastapi-dev
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "start"]

# THIS IS CALLED MULTI-STAGE BUILDING IN DOCKER
# HOW TO PERSIST THE DATABASE.DB WHEN DOCKER BUILDING...
# https://docs.docker.com/get-started/05_persisting_data/
# FOR CAPROVER... https://caprover.com/docs/persistent-apps.html