FROM maven:3.9.11-eclipse-temurin-17 AS soundcloud-plugin-build
WORKDIR /build
COPY sources-plugin/pom.xml ./
COPY sources-plugin/src ./src
RUN mvn -B -ntp verify

FROM ghcr.io/lavalink-devs/lavalink:4.2.2
COPY --from=soundcloud-plugin-build --chown=lavalink:lavalink /build/target/paradoxplus-soundcloud.jar /opt/Lavalink/plugins/
COPY application.yml /opt/Lavalink/application.yml
