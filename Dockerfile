FROM node:4.6.0
MAINTAINER maintainer
ENV INSROOT  /opt/app
ENV APPUSER dispatcher
RUN mkdir -p ${INSROOT}/${APPUSER}/lib \
    && mkdir -p ${INSROOT}/${APPUSER}/etc \
      && mkdir -p ${INSROOT}/${APPUSER}/log \
    &&  useradd -d ${INSROOT}/${APPUSER}  ${APPUSER}
COPY *.js ${INSROOT}/${APPUSER}/
COPY package.json ${INSROOT}/${APPUSER}/
COPY lib ${INSROOT}/${APPUSER}/lib/
COPY etc/config.json.development ${INSROOT}/${APPUSER}/etc/config.json
COPY etc/log4js.json ${INSROOT}/${APPUSER}/etc/log4js.json
WORKDIR ${INSROOT}/${APPUSER}
RUN npm install --production && chown -R ${APPUSER}:${APPUSER} ${INSROOT}/${APPUSER} && npm remove -g npm
USER ${APPUSER}
VOLUME ${INSROOT}/${APPUSER}/log
ENTRYPOINT ["/usr/local/bin/node", "dispatcher.js"]
