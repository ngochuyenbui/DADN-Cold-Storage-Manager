FROM maven:3.9.11-eclipse-temurin-17 AS build
WORKDIR /app

COPY pom.xml ./
RUN mvn -DskipTests dependency:go-offline

COPY src src
RUN mvn -DskipTests package

FROM eclipse-temurin:17-jre
WORKDIR /app

COPY --from=build /app/target/*.jar /app/app.jar

EXPOSE 8080
ENTRYPOINT ["java", "-Dspring.docker.compose.enabled=false", "-jar", "/app/app.jar"]
