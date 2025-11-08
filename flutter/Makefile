.PHONY: prepare
prepare:
	fvm use
	fvm flutter clean
	fvm flutter pub get
	fvm flutter packages pub run build_runner build --delete-conflicting-outputs

.PHONY: run
run:
	fvm flutter run

.PHONY: release
release:
	fvm flutter run --release
