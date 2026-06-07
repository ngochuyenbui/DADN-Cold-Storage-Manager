# FreshGuard Backend - Huong dan chay

Tai lieu nay huong dan chay backend Spring Boot trong thu muc `backend/demo` theo 2 cach:
- Chay local (khuyen dung khi dev)
- Chay bang Docker Compose

## 1. Yeu cau

- Java 17
- PostgreSQL (khuyen dung 14+)
- Docker + Docker Compose (neu chay container)

## 2. Chay local (Java + PostgreSQL)

### Buoc 1: Tao database

Backend dang duoc cau hinh mac dinh trong `src/main/resources/application.properties`:
- DB URL: `jdbc:postgresql://localhost:5432/DADN`
- User: `postgres`
- Password: `123456`

Ban can tao database `DADN` truoc, sau do import schema va du lieu mau:

```sql
CREATE DATABASE "DADN";
```

Trong database `DADN`, chay lan luot:
- `src/main/resources/schema.sql`
- `db/example.sql`

Neu may ban dung user/password khac, co the override nhanh khi chay lenh (Windows CMD):

```bat
set SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/<ten_db>
set SPRING_DATASOURCE_USERNAME=<user>
set SPRING_DATASOURCE_PASSWORD=<password>
.\mvnw.cmd spring-boot:run
```

### Buoc 2: Chay backend

Trong thu muc `backend/demo`:

**Windows (CMD/PowerShell):**
```bat
.\mvnw.cmd spring-boot:run
```

**macOS/Linux:**
```bash
./mvnw spring-boot:run
```

Mac dinh server chay o cong `8080`.

### Buoc 3: Kiem tra nhanh

- Mo trinh duyet: `http://localhost:8080`
- Neu co frontend, kiem tra frontend goi API duoc qua backend port `8080`.

## 3. Chay bang Docker Compose

Trong thu muc `backend/demo`:

```bash
docker compose -f compose.yaml up --build
```

Compose hien tai se khoi tao:
- `demo-backend` (Spring Boot)
- `postgres` (port `5432`)
- `rabbitmq` (port `5672`)

Luu y:
- Khi chay Compose, backend dung bien moi truong trong `compose.yaml` (khac voi cau hinh local trong `application.properties`).
- DB trong Compose la `mydatabase`, user `myuser`, password `secret`.

Dung he thong:

```bash
docker compose -f compose.yaml down
```

## 4. Cac lenh Maven hay dung

Trong thu muc `backend/demo`:

**Windows:**
```bat
.\mvnw.cmd clean test
.\mvnw.cmd clean package
```

**macOS/Linux:**
```bash
./mvnw clean test
./mvnw clean package
```

Sau khi package, file jar thuong nam trong thu muc `target/`.

## 5. Loi thuong gap

- Port `8080` dang bi chiem:
  - Tat tien trinh dang dung port hoac doi port trong `application.properties`.
- Khong ket noi duoc PostgreSQL khi chay local:
  - Kiem tra dung ten DB `DADN`, user/password va service PostgreSQL dang chay.
- Loi schema/khong co bang:
  - Chay lai `src/main/resources/schema.sql` truoc, sau do moi chay `db/example.sql`.
