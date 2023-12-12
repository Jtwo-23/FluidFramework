/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/*
 * THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.
 * Generated by fluid-type-test-generator in @fluidframework/build-tools.
 */
import type * as old from "@fluidframework/view-interfaces-previous";
import type * as current from "../../index";


// See 'build-tools/src/type-test-generator/compatibility.ts' for more information.
type TypeOnly<T> = T extends number
	? number
	: T extends string
	? string
	: T extends boolean | bigint | symbol
	? T
	: {
			[P in keyof T]: TypeOnly<T[P]>;
	  };

/*
* Validate forward compat by using old type in place of current type
* If breaking change required, add in package.json under typeValidation.broken:
* "VariableDeclaration_IFluidMountableView": {"forwardCompat": false}
*/
declare function get_old_VariableDeclaration_IFluidMountableView():
    TypeOnly<typeof old.IFluidMountableView>;
declare function use_current_VariableDeclaration_IFluidMountableView(
    use: TypeOnly<typeof current.IFluidMountableView>): void;
use_current_VariableDeclaration_IFluidMountableView(
    get_old_VariableDeclaration_IFluidMountableView());

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken:
* "VariableDeclaration_IFluidMountableView": {"backCompat": false}
*/
declare function get_current_VariableDeclaration_IFluidMountableView():
    TypeOnly<typeof current.IFluidMountableView>;
declare function use_old_VariableDeclaration_IFluidMountableView(
    use: TypeOnly<typeof old.IFluidMountableView>): void;
use_old_VariableDeclaration_IFluidMountableView(
    get_current_VariableDeclaration_IFluidMountableView());

/*
* Validate forward compat by using old type in place of current type
* If breaking change required, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IFluidMountableView": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_IFluidMountableView():
    TypeOnly<old.IFluidMountableView>;
declare function use_current_InterfaceDeclaration_IFluidMountableView(
    use: TypeOnly<current.IFluidMountableView>): void;
use_current_InterfaceDeclaration_IFluidMountableView(
    get_old_InterfaceDeclaration_IFluidMountableView());

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IFluidMountableView": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_IFluidMountableView():
    TypeOnly<current.IFluidMountableView>;
declare function use_old_InterfaceDeclaration_IFluidMountableView(
    use: TypeOnly<old.IFluidMountableView>): void;
use_old_InterfaceDeclaration_IFluidMountableView(
    get_current_InterfaceDeclaration_IFluidMountableView());

/*
* Validate forward compat by using old type in place of current type
* If breaking change required, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IFluidMountableViewClass": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_IFluidMountableViewClass():
    TypeOnly<old.IFluidMountableViewClass>;
declare function use_current_InterfaceDeclaration_IFluidMountableViewClass(
    use: TypeOnly<current.IFluidMountableViewClass>): void;
use_current_InterfaceDeclaration_IFluidMountableViewClass(
    get_old_InterfaceDeclaration_IFluidMountableViewClass());

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IFluidMountableViewClass": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_IFluidMountableViewClass():
    TypeOnly<current.IFluidMountableViewClass>;
declare function use_old_InterfaceDeclaration_IFluidMountableViewClass(
    use: TypeOnly<old.IFluidMountableViewClass>): void;
use_old_InterfaceDeclaration_IFluidMountableViewClass(
    get_current_InterfaceDeclaration_IFluidMountableViewClass());

/*
* Validate forward compat by using old type in place of current type
* If breaking change required, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IProvideFluidMountableView": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_IProvideFluidMountableView():
    TypeOnly<old.IProvideFluidMountableView>;
declare function use_current_InterfaceDeclaration_IProvideFluidMountableView(
    use: TypeOnly<current.IProvideFluidMountableView>): void;
use_current_InterfaceDeclaration_IProvideFluidMountableView(
    get_old_InterfaceDeclaration_IProvideFluidMountableView());

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IProvideFluidMountableView": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_IProvideFluidMountableView():
    TypeOnly<current.IProvideFluidMountableView>;
declare function use_old_InterfaceDeclaration_IProvideFluidMountableView(
    use: TypeOnly<old.IProvideFluidMountableView>): void;
use_old_InterfaceDeclaration_IProvideFluidMountableView(
    get_current_InterfaceDeclaration_IProvideFluidMountableView());
